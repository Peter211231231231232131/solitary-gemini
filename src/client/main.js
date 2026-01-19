import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import nipplejs from 'nipplejs';
import { Humanoid } from './Humanoid.js';

const socket = io();

// Physics Constants
const DELTA = 1 / 60;
const GRAVITY = 9.82;
const JUMP_FORCE = 7.0;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.6;

// World Awareness
let worldObstacles = []; // Array of AABBs

function checkCollisions(pos, vel, dt) {
    const halfWidth = PLAYER_RADIUS;

    // Resolve Y first (floor)
    if (pos.y < 0.8) {
        pos.y = 0.8;
        vel.y = 0;
    }

    // Resolve X and Z against world boxes
    for (const box of worldObstacles) {
        const pMin = { x: pos.x - halfWidth, y: pos.y - 1.1, z: pos.z - halfWidth };
        const pMax = { x: pos.x + halfWidth, y: pos.y + 0.5, z: pos.z + halfWidth };

        const bMin = box.min;
        const bMax = box.max;

        if (pMin.x < bMax.x && pMax.x > bMin.x &&
            pMin.y < bMax.y && pMax.y > bMin.y &&
            pMin.z < bMax.z && pMax.z > bMin.z) {

            const dx1 = bMax.x - pMin.x;
            const dx2 = pMax.x - bMin.x;
            const dy1 = bMax.y - pMin.y;
            const dy2 = pMax.y - bMin.y;
            const dz1 = bMax.z - pMin.z;
            const dz2 = pMax.z - bMin.z;

            const minX = Math.min(dx1, dx2);
            const minY = Math.min(dy1, dy2);
            const minZ = Math.min(dz1, dz2);

            if (minX < minY && minX < minZ) {
                pos.x += (dx1 < dx2) ? dx1 : -dx2;
            } else if (minZ < minX && minZ < minY) {
                pos.z += (dz1 < dz2) ? dz1 : -dz2;
            } else {
                if (vel.y < 0) {
                    pos.y += dy1;
                    vel.y = 0;
                } else {
                    pos.y -= dy2;
                    vel.y = 0;
                }
            }
        }
    }
}

function applyMovement(position, velocity, input, delta) {
    const speed = input.speed;
    velocity.x = input.x * speed;
    velocity.z = input.z * speed;
    velocity.y -= GRAVITY * delta;

    const isGrounded = position.y < 1.25;
    if (input.jump && isGrounded && !input.crouch) {
        velocity.y = JUMP_FORCE;
    }

    position.x += velocity.x * delta;
    position.y += velocity.y * delta;
    position.z += velocity.z * delta;

    checkCollisions(position, velocity, delta);
}

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

// Ground (Basketball Court)
const courtWidth = 28;
const courtDepth = 15;
const groundGeometry = new THREE.PlaneGeometry(courtWidth, courtDepth);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xcc7722 }); // Hardwood-ish orange-brown
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Court Lines
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const createLine = (w, d, x, z) => {
    const geo = new THREE.PlaneGeometry(w, d);
    const mesh = new THREE.Mesh(geo, lineMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    scene.add(mesh);
};
// Boundary
createLine(courtWidth, 0.1, 0, courtDepth / 2);
createLine(courtWidth, 0.1, 0, -courtDepth / 2);
createLine(0.1, courtDepth, courtWidth / 2, 0);
createLine(0.1, courtDepth, -courtWidth / 2, 0);
// Center Line
createLine(0.1, courtDepth, 0, 0);

// Ball Rendering
const ballGeo = new THREE.SphereGeometry(0.25, 16, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4500 }); // Orange-red ball
const ballMesh = new THREE.Mesh(ballGeo, ballMat);
ballMesh.castShadow = true;
scene.add(ballMesh);

// Hoops Rendering
const hoopGroup = new THREE.Group();
const createHoop = (x, z, color, teamName) => {
    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 1.5, z);
    scene.add(pole);

    // Backboard
    const bbGeo = new THREE.BoxGeometry(0.1, 1.2, 1.8);
    const bbMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const bb = new THREE.Mesh(bbGeo, bbMat);
    bb.position.set(x + (x < 0 ? 0.1 : -0.1), 3.5, z);
    scene.add(bb);

    // Rim
    const rimGeo = new THREE.TorusGeometry(0.3, 0.05, 8, 24);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x + (x < 0 ? 0.4 : -0.4), 3.0, z);
    scene.add(rim);

    // Label (Simple DOM-based label or World Space Canvas if we had time, let's use a 3D sprite for simplicity)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(teamName, 128, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, 4.5, z);
    sprite.scale.set(2, 1, 1);
    scene.add(sprite);
};
createHoop(-13.5, 0, 0xff0000, "TEAM 1"); // Team 1 Side
createHoop(13.5, 0, 0x0000ff, "TEAM 2");  // Team 2 Side

// Score HUD
const scoreHUD = document.createElement('div');
scoreHUD.id = 'score-hud';
scoreHUD.style.position = 'absolute';
scoreHUD.style.top = '20px';
scoreHUD.style.width = '100%';
scoreHUD.style.textAlign = 'center';
scoreHUD.style.color = '#00ff00';
scoreHUD.style.fontSize = '32px';
scoreHUD.style.fontWeight = 'bold';
scoreHUD.style.fontFamily = 'monospace';
scoreHUD.style.textShadow = '0 0 10px #000';
scoreHUD.textContent = 'TEAM 1: 0 | TEAM 2: 0';
document.body.appendChild(scoreHUD);

// Controls
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');

// Click to capture mouse (only if logged in and not chatting)
document.addEventListener('click', () => {
    if (isLoggedIn && !isChatOpen && !controls.isLocked) {
        controls.lock();
    }
});

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    // Show instructions only if not chatting
    if (isLoggedIn && !isChatOpen) {
        instructions.style.display = 'block';
    }
});

// Shooting & Stealing Input
const raycaster = new THREE.Raycaster();
document.addEventListener('mousedown', (e) => {
    if (isLoggedIn && controls.isLocked && e.button === 0) {
        // If I don't have the ball, try to steal
        const ballState = currentGameState ? currentGameState.ball : null;
        if (ballState && ballState.owner !== myId) {
            // Check if we are aiming at the owner
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);

            // Get all player meshes
            const playerMeshes = Object.entries(players).map(([id, p]) => {
                p.mesh.userData = { playerId: id };
                return p.mesh;
            });

            const intersects = raycaster.intersectObjects(playerMeshes, true);
            if (intersects.length > 0) {
                // Find top level humanoid mesh
                let obj = intersects[0].object;
                while (obj.parent && !obj.userData.playerId) {
                    obj = obj.parent;
                }

                if (obj.userData.playerId) {
                    socket.emit('steal', { targetId: obj.userData.playerId });
                }
            } else {
                // Normal shoot if we have it, or just empty click
                socket.emit('shoot');
            }
        } else {
            socket.emit('shoot');
        }
    }
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

// Players
const players = {};
let myId = null;

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

// Pointer Lock Helper
function attemptLock() {
    if (isLoggedIn && !isChatOpen) {
        controls.lock();
    }
}

// Interact with Login
function joinGame() {
    const name = usernameInput.value.trim() || `Player_${Math.floor(Math.random() * 900) + 100}`;
    if (name) {
        myName = name;
        loginScreen.style.display = 'none';
        isLoggedIn = true;
        socket.emit('joinGame', { name: myName });

        // Show instructions (the "Click to Start" screen)
        instructions.style.display = 'flex';
        instructions.style.alignItems = 'center';
        instructions.style.justifyContent = 'center';
    }
}

playButton.addEventListener('click', joinGame);
usernameInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        joinGame();
    }
});

// Auto-focus username on load
usernameInput.focus();

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
        if (!isChatOpen) {
            // Open chat
            isChatOpen = true;
            chatInput.style.display = 'block';
            chatInput.focus();
            controls.unlock();
        }
    }
});

// Chat Input specific behavior
chatInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        // Send message
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('chatMessage', text);
        }
        chatInput.value = '';
        chatInput.style.display = 'none';
        chatInput.blur();
        isChatOpen = false;

        // Return focus to game
        attemptLock();
    }

    // Stop movement keys but let ENTER bubble or handle it above
    if (e.code !== 'Enter') {
        e.stopPropagation();
    }
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

    // Store obstacles for prediction
    if (data.obstacles) {
        worldObstacles = data.obstacles.map(obs => {
            const min = {
                x: obs.position.x - obs.size.x / 2,
                y: obs.position.y - obs.size.y / 2,
                z: obs.position.z - obs.size.z / 2
            };
            const max = {
                x: obs.position.x + obs.size.x / 2,
                y: obs.position.y + obs.size.y / 2,
                z: obs.position.z + obs.size.z / 2
            };
            return { min, max };
        });

        data.obstacles.forEach(obs => {
            const mesh = new THREE.Mesh(boxGeo, boxMat);
            mesh.position.set(obs.position.x, obs.position.y, obs.position.z);
            mesh.scale.set(obs.size.x, obs.size.y, obs.size.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
        });
    }

    // Create my own mesh (hidden by default)
    let myColor = 0xff0000;
    let startPos = new THREE.Vector3(0, 5, 0);

    if (data.players && data.players[myId]) {
        myColor = data.players[myId].color;
        startPos.copy(data.players[myId].position);
    }

    // Set initial logical and visual positions immediately to prevent jump
    predictedPosition.copy(startPos);
    visualPosition.copy(startPos);

    myPlayerMesh = new Humanoid(myColor);
    myPlayerMesh.mesh.visible = false; // Start in 1st person
    myPlayerMesh.lastPos = new THREE.Vector3().copy(startPos);
    myPlayerMesh.team = data.players[myId] ? data.players[myId].team : 1;
    scene.add(myPlayerMesh.mesh);

    // Spawn existing players
    for (const id in data.players) {
        if (id !== myId) {
            addPlayer(id, data.players[id].position, data.players[id].color, data.players[id].team);
        }
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== myId) {
        addPlayer(data.id, data.position, data.color, data.team);
    }
});
socket.on('playerLeft', (id) => {
    removePlayer(id);
});

// Client-Side Prediction State
let inputSequence = 0;
let pendingInputs = [];
let predictedPosition = new THREE.Vector3(0, 5, 0);
let predictedVelocity = new THREE.Vector3(0, 0, 0);
let currentGameState = null;

socket.on('state', (state) => {
    if (!state.players) return;
    currentGameState = state;

    // 1. Sync Ball
    if (state.ball) {
        const isOwner = state.ball.owner === myId;
        // If I'm NOT the owner, sync ball pos from server
        // If I AM the owner, the local loop handles positioning for me (less jitter)
        if (!isOwner) {
            const targetPos = new THREE.Vector3().copy(state.ball.position);
            ballMesh.position.lerp(targetPos, 0.3);
        } else {
            // Owner prediction: ball stays in front of us
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            ballMesh.position.set(
                predictedPosition.x + forward.x * 0.5,
                predictedPosition.y + 0.2,
                predictedPosition.z + forward.z * 0.5
            );
        }
    }

    // 2. Sync Score
    if (state.scores) {
        scoreHUD.textContent = `TEAM 1: ${state.scores.team1} | TEAM 2: ${state.scores.team2}`;
    }

    // 3. Sync Players
    const playerStates = state.players;
    for (const id in playerStates) {
        if (id === myId) {
            // Server Authoritative State
            const serverPos = new THREE.Vector3().copy(playerStates[id].position);
            const serverVel = new THREE.Vector3().copy(playerStates[id].velocity || { x: 0, y: 0, z: 0 });
            const lastProcessedSeq = playerStates[id].seq || 0;

            // Discard confirmed inputs
            pendingInputs = pendingInputs.filter(input => input.seq > lastProcessedSeq);

            // Re-simulate from server position
            predictedPosition.copy(serverPos);
            predictedVelocity.copy(serverVel);

            // Re-apply all pending inputs (prediction)
            for (const input of pendingInputs) {
                applyMovement(predictedPosition, predictedVelocity, input, DELTA);
            }

            // LOGICAL CORRECTION
            const dist = visualPosition.distanceTo(predictedPosition);
            if (dist > 2.0) {
                visualPosition.copy(predictedPosition);
            }

        } else {
            if (!players[id]) {
                addPlayer(id, playerStates[id].position, playerStates[id].color, playerStates[id].team);
            }
            if (players[id]) {
                const humanoid = players[id];
                const targetPos = new THREE.Vector3().copy(playerStates[id].position);
                targetPos.y -= 1;

                humanoid.mesh.position.lerp(targetPos, 0.2);

                if (playerStates[id].yaw !== undefined) {
                    const targetYaw = playerStates[id].yaw;
                    const currentYaw = humanoid.mesh.rotation.y;
                    let diff = targetYaw - currentYaw;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    humanoid.mesh.rotation.y += diff * 0.2;
                }

                const velocity = humanoid.mesh.position.distanceTo(humanoid.lastPos);
                const isCrouching = playerStates[id].crouch || false;
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
        camera.position.set(playerPos.x, playerPos.y + 0.7, playerPos.z);
    }
}

function addPlayer(id, position, colorCode, team) {
    const humanoid = new Humanoid(colorCode);
    humanoid.mesh.position.copy(position);
    humanoid.mesh.position.y -= 1;
    humanoid.lastPos = new THREE.Vector3().copy(position);
    humanoid.team = team;

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
let visualPosition = new THREE.Vector3(0, 5, 0);
let physicsAccumulator = 0;

function animate() {
    requestAnimationFrame(animate);

    // Only process input if logged in
    if (!isLoggedIn) {
        renderer.render(scene, camera);
        return;
    }

    const frameDelta = Math.min(clock.getDelta(), 0.1); // Max 100ms per frame to prevent "death spirals"
    physicsAccumulator += frameDelta;

    // 1. LOGICAL PHYSICS & PREDICTION (Fixed Timestep)
    while (physicsAccumulator >= DELTA) {
        physicsAccumulator -= DELTA;

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

            // Apply prediction
            const input = {
                x: direction.x,
                z: direction.z,
                speed: speed,
                jump: moveState.jump,
                crouch: moveState.crouch,
                dt: DELTA
            };
            applyMovement(predictedPosition, predictedVelocity, input, DELTA);

            // Send/Store Input
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

            pendingInputs.push({
                seq: inputSequence,
                x: direction.x,
                z: direction.z,
                speed: speed,
                jump: moveState.jump,
                crouch: moveState.crouch,
                dt: DELTA
            });

            socket.emit('input', serverInput);
        }
    }

    // 2. VISUAL SMOOTHING (Per-frame)
    // Lerp towards the definitive logical position
    visualPosition.lerp(predictedPosition, 0.4);

    // Update Visual Objects
    updateCamera(visualPosition);

    if (myPlayerMesh) {
        const targetMeshPos = visualPosition.clone();
        targetMeshPos.y -= 1; // Offset for base
        myPlayerMesh.mesh.position.copy(targetMeshPos);
        myPlayerMesh.mesh.rotation.y = camera.rotation.y;

        // Animation velocity based on delta between predicted frames
        const animVelocity = predictedPosition.distanceTo(myPlayerMesh.lastPos);
        const isCrouching = moveState.crouch;
        myPlayerMesh.update(clock.getElapsedTime(), animVelocity > 0.01, isCrouching);
        myPlayerMesh.lastPos.copy(predictedPosition);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
