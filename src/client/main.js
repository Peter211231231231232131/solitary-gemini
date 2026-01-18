import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const socket = io();

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 0, 50);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Eye level

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Controls
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');

document.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    instructions.style.display = 'block';
});

// Input handling
const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false
};

const onKeyDown = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = true; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = true; break;
        case 'Space': moveState.jump = true; break;
    }
};

const onKeyUp = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = false; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = false; break;
        case 'Space': moveState.jump = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// Players
const players = {};
const playerGeo = new THREE.SphereGeometry(1, 32, 32);
const playerMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

// Networking
let myId = null;

socket.on('init', (data) => {
    myId = data.id;
    for (const id in data.players) {
        if (id !== myId) {
            addPlayer(id, data.players[id].position);
        }
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== myId) {
        addPlayer(data.id, data.position);
    }
});

socket.on('playerLeft', (id) => {
    removePlayer(id);
});

socket.on('state', (state) => {
    for (const id in state) {
        if (id === myId) {
            // Update camera position based on server (naive reconciliation)
            // Ideally we do client-side prediction, but for now we trust server with smoothing if needed
            // But this will feel laggy. 
            // Better: update camera locally, and use server corrections.
            // For MVP: Simplest is snap camera to server position.
            camera.position.copy(state[id].position);
        } else {
            if (players[id]) {
                players[id].position.copy(state[id].position);
                players[id].quaternion.copy(state[id].quaternion);
            }
        }
    }
});

function addPlayer(id, position) {
    const mesh = new THREE.Mesh(playerGeo, playerMat);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);
    players[id] = mesh;
}

function removePlayer(id) {
    if (players[id]) {
        scene.remove(players[id]);
        delete players[id];
    }
}

// Game Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        // Calculate movement direction relative to camera
        const direction = new THREE.Vector3();
        const front = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        // Flatten to XZ plane
        front.y = 0;
        front.normalize();
        right.y = 0;
        right.normalize();

        if (moveState.forward) direction.add(front);
        if (moveState.backward) direction.sub(front);
        if (moveState.right) direction.add(right);
        if (moveState.left) direction.sub(right);

        if (direction.length() > 0) direction.normalize();

        // Send input to server
        socket.emit('input', {
            x: direction.x,
            z: direction.z,
            jump: moveState.jump
        });
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
