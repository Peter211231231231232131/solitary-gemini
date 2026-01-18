import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import nipplejs from 'nipplejs';

const socket = io();

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 0, 50);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Eye level
camera.rotation.order = 'YXZ'; // Standard for FPS

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

// Mobile Controls
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const rotationSpeed = 0.005;

if (isMobile) {
    const joystickZone = document.getElementById('joystick-zone');
    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white'
    });

    manager.on('move', (evt, data) => {
        const forward = data.vector.y;
        const turn = data.vector.x;

        // Reset state
        moveState.forward = forward > 0.1;
        moveState.backward = forward < -0.1;
        moveState.left = turn < -0.1;
        moveState.right = turn > 0.1;
    });

    manager.on('end', () => {
        moveState.forward = false;
        moveState.backward = false;
        moveState.left = false;
        moveState.right = false;
    });

    // Jump Button
    const jumpBtn = document.getElementById('jump-button');
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        moveState.jump = true;
    });
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        moveState.jump = false;
    });

    // Look Logic (Touch Drag on right side)
    const lookZone = document.getElementById('look-zone');
    let previousTouchX = 0;
    let previousTouchY = 0;

    lookZone.addEventListener('touchstart', (e) => {
        previousTouchX = e.touches[0].screenX;
        previousTouchY = e.touches[0].screenY;
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const movementX = touch.screenX - previousTouchX;
        const movementY = touch.screenY - previousTouchY;

        previousTouchX = touch.screenX;
        previousTouchY = touch.screenY;

        // Apply rotation to camera directly since PointerLock is not active on mobile
        camera.rotation.y -= movementX * rotationSpeed;
        camera.rotation.x -= movementY * rotationSpeed;

        // Clamp vertical rotation (pitch)
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

        // For PointerLockControls, we usually update the object, but if we aren't locked, we modify camera directly.
        // However, movement logic relies on camera.quaternion, so this should work.
    }, { passive: false });
}

import { Humanoid } from './Humanoid.js';

// ... (previous imports)

// Players
const players = {};
// Removed sphere geometry/material as we use Humanoid class now

// ... (code)

// 3rd Person View State
let isThirdPerson = false;
let myPlayerMesh = null;

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
        isThirdPerson = !isThirdPerson;
        if (myPlayerMesh) {
            myPlayerMesh.mesh.visible = isThirdPerson;
        }
    }
});

socket.on('init', (data) => {
    myId = data.id;

    // Create my own mesh (hidden by default)
    // Find my color from data.players
    let myColor = 0xff0000;
    if (data.players[myId]) {
        myColor = data.players[myId].color;
    }

    myPlayerMesh = new Humanoid(myColor);
    myPlayerMesh.mesh.visible = false; // Start in 1st person
    myPlayerMesh.lastPos = new THREE.Vector3();
    scene.add(myPlayerMesh.mesh);

    // ... (obstacles)
    // Spawn existing players
    for (const id in data.players) {
        if (id !== myId) {
            addPlayer(id, data.players[id].position, data.players[id].color);
        }
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== myId) {
        addPlayer(data.id, data.position, data.color);
    }
});

socket.on('playerLeft', (id) => {
    removePlayer(id);
});

socket.on('state', (state) => {
    for (const id in state) {
        if (id === myId) {
            // My Player Logic
            if (myPlayerMesh) {
                const pos = state[id].position;
                myPlayerMesh.mesh.position.copy(pos);
                myPlayerMesh.mesh.position.y -= 1;
                myPlayerMesh.mesh.rotation.y = camera.rotation.y;

                // Animation
                const velocity = new THREE.Vector3(
                    pos.x - myPlayerMesh.lastPos.x,
                    0,
                    pos.z - myPlayerMesh.lastPos.z
                ).length();
                myPlayerMesh.update(clock.getElapsedTime(), velocity > 0.01);
                myPlayerMesh.lastPos.copy(pos);
            }

            // Camera Logic
            if (isThirdPerson) {
                // Simple 3rd person: Pull camera back 4 units from eyes
                const offset = new THREE.Vector3(0, 0, 4);
                offset.applyQuaternion(camera.quaternion);

                // Position = Player Pos + Eye Height + Offset
                // Note: Player pos from server is center of physics body (y=5). 
                // We want eye level to be slightly above that? No, physics body is y=5. 
                // Wait, body spawn is (0,5,0). 

                camera.position.copy(state[id].position).add(offset);
            } else {
                camera.position.copy(state[id].position);
                // camera.position.y += 0.5; // Optional adjusting
            }

        } else {
            if (!players[id]) {
                addPlayer(id, state[id].position, state[id].color);
            }
            if (players[id]) {
                const humanoid = players[id];
                // Interpolate position
                humanoid.mesh.position.copy(state[id].position);
                // Apply Y offset to align feet with ground (since server position is center mass)
                humanoid.mesh.position.y -= 1;

                // Update Rotation (Yaw)
                if (state[id].yaw !== undefined) {
                    humanoid.mesh.rotation.y = state[id].yaw;
                }

                // Animation
                // Check if moving
                const velocity = new THREE.Vector3(
                    state[id].position.x - humanoid.lastPos.x,
                    0,
                    state[id].position.z - humanoid.lastPos.z
                ).length();

                humanoid.update(clock.getElapsedTime(), velocity > 0.01);
                humanoid.lastPos.copy(state[id].position);
            }
        }
    }
});

function addPlayer(id, position, colorCode) {
    const humanoid = new Humanoid(colorCode);
    humanoid.mesh.position.copy(position);
    humanoid.mesh.position.y -= 1; // Offset
    humanoid.lastPos = new THREE.Vector3().copy(position);

    scene.add(humanoid.mesh);
    players[id] = humanoid;
}

function removePlayer(id) {
    if (players[id]) {
        scene.remove(players[id].mesh);
        delete players[id];
    }
}

// Game Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked || isMobile) {
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
        // Get camera yaw (rotation around Y axis in radians)
        // We get it from the camera's rotation Euler, but order controls what Y means.
        // We set order to YXZ so .y is the yaw.
        const yaw = camera.rotation.y;

        socket.emit('input', {
            x: direction.x,
            z: direction.z,
            jump: moveState.jump,
            yaw: yaw
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
