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
    jump: false,
    sprint: false,
    crouch: false
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
        case 'ShiftLeft':
        case 'ShiftRight': moveState.sprint = true; break;
        case 'KeyC': moveState.crouch = true; break;
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
        case 'ShiftLeft':
        case 'ShiftRight': moveState.sprint = false; break;
        case 'KeyC': moveState.crouch = false; break;
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
let myId = null;
// Removed sphere geometry/material as we use Humanoid class now

// ... (code)

// Login & Chat Elements
const loginScreen = document.getElementById('login-screen');
const usernameInput = document.getElementById('username-input');
const playButton = document.getElementById('play-button');
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

let isLoggedIn = false;
let myName = "Player";
let isChatOpen = false;

// Interact with Login
playButton.addEventListener('click', () => {
    const name = usernameInput.value.trim() || "Player";
    if (name) {
        myName = name;
        loginScreen.style.display = 'none';
        isLoggedIn = true;
        socket.emit('joinGame', { name: myName });
        controls.lock();
    }
});

// Chat Logic
function addChatMessage(name, text, isSystem = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message');
    if (isSystem) msgDiv.classList.add('system-message');
    msgDiv.textContent = isSystem ? text : `${name}: ${text}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle Chat
document.addEventListener('keydown', (e) => {
    // Open chat with Enter if logged in
    if (e.code === 'Enter' && isLoggedIn) {
        if (isChatOpen) {
            // Send message if not empty
            const text = chatInput.value.trim();
            if (text) {
                socket.emit('chatMessage', text);
            }
            chatInput.value = '';
            chatInput.style.display = 'none';
            chatInput.blur();
            isChatOpen = false;
            controls.lock();
        } else {
            // Open chat
            isChatOpen = true;
            chatInput.style.display = 'block';
            chatInput.focus();
            controls.unlock();
        }
    }
});

// Stop movement keys from affecting game when typing
chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
});

socket.on('chatMessage', (data) => {
    addChatMessage(data.name, data.text);
});

socket.on('notification', (text) => {
    addChatMessage(null, text, true);
});

// Environment
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x808080 });

// 3rd Person View State
let isThirdPerson = false;
let myPlayerMesh = null;

document.addEventListener('keydown', (e) => {
    if (isChatOpen) return; // Ignore game keys if chatting

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
    let myColor = 0xff0000;
    if (data.players[myId]) {
        myColor = data.players[myId].color;
    }

    myPlayerMesh = new Humanoid(myColor);
    myPlayerMesh.mesh.visible = false; // Start in 1st person
    myPlayerMesh.lastPos = new THREE.Vector3();
    scene.add(myPlayerMesh.mesh);

    // Spawn Obstacles
    if (data.obstacles) {
        data.obstacles.forEach(obs => {
            const mesh = new THREE.Mesh(boxGeo, boxMat);
            mesh.position.set(obs.position.x, obs.position.y, obs.position.z);
            mesh.scale.set(obs.size.x, obs.size.y, obs.size.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
        });
    }

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

// Client-Side Prediction State
let inputSequence = 0;
let pendingInputs = [];
let predictedPosition = new THREE.Vector3(0, 5, 0);
const DELTA = 1 / 60; // Fixed timestep for prediction

// Reusable movement logic
function applyMovement(position, input, delta) {
    const speed = input.speed;
    position.x += input.x * speed * delta;
    position.z += input.z * speed * delta;
    // Note: Y axis (gravity/jump) is still largely server-authoritative for now to prevent desync
    // but horizontal movement is fully predicted.
}

socket.on('state', (state) => {
    for (const id in state) {
        if (id === myId) {
            // Server Authoritative State
            const serverPos = new THREE.Vector3().copy(state[id].position);
            const lastProcessedSeq = state[id].seq || 0;

            // 1. Discard confirmed inputs
            pendingInputs = pendingInputs.filter(input => input.seq > lastProcessedSeq);

            // 2. Re-simulate from server position
            // Start with authoritative state
            predictedPosition.copy(serverPos);

            // Re-apply all pending inputs (prediction)
            for (const input of pendingInputs) {
                applyMovement(predictedPosition, input, DELTA);
            }

            // 3. Smooth Visual Correction (Reconciliation)
            if (myPlayerMesh) {
                // If divergence is too high, snap (teleport)
                if (myPlayerMesh.mesh.position.distanceTo(predictedPosition) > 2.0) {
                    myPlayerMesh.mesh.position.copy(predictedPosition);
                } else {
                    // Otherwise, smoothly lerp visual mesh towards predicted logical position
                    // This hides small jitter from network corrections
                    myPlayerMesh.mesh.position.lerp(predictedPosition, 0.2);
                }

                myPlayerMesh.mesh.position.y = serverPos.y - 1; // Keep Y synced with server mostly
                myPlayerMesh.mesh.rotation.y = camera.rotation.y;

                // Animation
                const velocity = predictedPosition.distanceTo(myPlayerMesh.lastPos);
                const isCrouching = moveState.crouch;
                myPlayerMesh.update(clock.getElapsedTime(), velocity > 0.01, isCrouching);
                myPlayerMesh.lastPos.copy(predictedPosition);
            }

            // Camera follows PREDICTED position for instant feedback
            updateCamera(predictedPosition);

        } else {
            if (!players[id]) {
                addPlayer(id, state[id].position, state[id].color);
            }
            if (players[id]) {
                const humanoid = players[id];
                const targetPos = new THREE.Vector3().copy(state[id].position);
                targetPos.y -= 1;

                humanoid.mesh.position.lerp(targetPos, 0.2);

                if (state[id].yaw !== undefined) {
                    const targetYaw = state[id].yaw;
                    const currentYaw = humanoid.mesh.rotation.y;
                    let diff = targetYaw - currentYaw;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    humanoid.mesh.rotation.y += diff * 0.2;
                }

                const velocity = humanoid.mesh.position.distanceTo(humanoid.lastPos);
                const isCrouching = state[id].crouch || false;
                humanoid.update(clock.getElapsedTime(), velocity > 0.01, isCrouching);
                humanoid.lastPos.copy(humanoid.mesh.position);
            }
        }
    }
});

function updateCamera(playerPos) {
    if (isThirdPerson) {
        const distance = 5;
        const height = 2;

        // Get camera's forward direction (where it's looking)
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);

        // Flatten to horizontal plane (ignore pitch for camera position)
        forward.y = 0;
        forward.normalize();

        // Camera position = player position - forward * distance + height
        // This puts camera BEHIND where the player is looking
        camera.position.set(
            playerPos.x - forward.x * distance,
            playerPos.y + height,
            playerPos.z - forward.z * distance
        );
    } else {
        camera.position.copy(playerPos);
    }
}

function addPlayer(id, position, colorCode) {
    const humanoid = new Humanoid(colorCode);
    humanoid.mesh.position.copy(position);
    humanoid.mesh.position.y -= 1;
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

    // Only process input if logged in
    if (!isLoggedIn) {
        renderer.render(scene, camera);
        return;
    }

    if ((controls.isLocked || isMobile) && !isChatOpen) {
        // Calculate movement direction
        const direction = new THREE.Vector3();
        const front = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        front.y = 0; front.normalize();
        right.y = 0; right.normalize();

        if (moveState.forward) direction.add(front);
        if (moveState.backward) direction.sub(front);
        if (moveState.right) direction.add(right);
        if (moveState.left) direction.sub(right);

        if (direction.length() > 0) direction.normalize();

        // Speed calculation
        let speed = 8;
        if (moveState.sprint) speed = 12;
        else if (moveState.crouch) speed = 4;

        // PREDICTION: Apply immediately to local state
        const input = {
            x: direction.x,
            z: direction.z,
            speed: speed,
            dt: DELTA
        };
        applyMovement(predictedPosition, input, DELTA);

        // Update Camera Immediately
        updateCamera(predictedPosition);

        // Update Mesh Immediately (Visual)
        if (myPlayerMesh) {
            myPlayerMesh.mesh.position.copy(predictedPosition);
            myPlayerMesh.mesh.position.y -= 1; // Offset for mesh center
        }

        // Send to Server
        inputSequence++;
        const serverInput = {
            seq: inputSequence,
            x: direction.x,
            z: direction.z,
            jump: moveState.jump,
            sprint: moveState.sprint,
            crouch: moveState.crouch,
            yaw: camera.rotation.y
        };

        // Store for reconciliation
        // We reuse the 'input' struct for applyMovement, but we need to store the one we sent to server
        // Actually, we need to store x/z/speed for re-simulation.
        pendingInputs.push({
            seq: inputSequence,
            x: direction.x,
            z: direction.z,
            speed: speed,
            dt: DELTA
        });

        socket.emit('input', serverInput);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
