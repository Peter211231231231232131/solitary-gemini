import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as CANNON from 'cannon-es';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../../dist');

const app = express();

app.use(express.static(distPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Physics World
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Game State
const players = {};
const obstacles = [];
const TIMESTEP = 1 / 60;

// Default Material
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
    friction: 0.0,
    restitution: 0.0
});
world.addContactMaterial(defaultContactMaterial);

// Ground
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Basketball Court & Hoops
// Court dimensions: ~28x15 meters
const COURT_WIDTH = 28;
const COURT_DEPTH = 15;

// Hoops
const hoops = [
    { id: 'hoop_1', position: { x: -13.5, y: 3.0, z: 0 }, team: 1 },
    { id: 'hoop_2', position: { x: 13.5, y: 3.0, z: 0 }, team: 2 }
];

// Add Hoop Colliders (Backboards and Rims)
hoops.forEach(hoop => {
    // Backboard
    const bbSize = { x: 0.1, y: 1.2, z: 1.8 };
    const bbShape = new CANNON.Box(new CANNON.Vec3(bbSize.x / 2, bbSize.y / 2, bbSize.z / 2));
    const bbBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
    bbBody.addShape(bbShape);
    bbBody.position.set(hoop.position.x + (hoop.team === 1 ? -0.1 : 0.1), hoop.position.y + 0.5, hoop.position.z);
    world.addBody(bbBody);
    obstacles.push({ position: bbBody.position, size: bbSize, id: `${hoop.id}_bb` });

    // Rim (Simplified as a ring of boxes)
    const rimRadius = 0.4;
    const rimThickness = 0.05;
    const segments = 8;
    for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const rimPartSize = new CANNON.Vec3(0.05, 0.05, 0.15);
        const rimPartShape = new CANNON.Box(rimPartSize);
        const rimPartBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
        rimPartBody.addShape(rimPartShape);
        const rimX = hoop.position.x + (hoop.team === 1 ? 0.4 : -0.4) + Math.cos(theta) * rimRadius;
        const rimZ = hoop.position.z + Math.sin(theta) * rimRadius;
        rimPartBody.position.set(rimX, hoop.position.y, rimZ);
        rimPartBody.quaternion.setFromEuler(0, -theta, 0);
        world.addBody(rimPartBody);
    }
});

// Basketball
const ballRadius = 0.25;
const ballMaterial = new CANNON.Material('ball');
const ballBody = new CANNON.Body({
    mass: 0.5,
    position: new CANNON.Vec3(0, 5, 0),
    shape: new CANNON.Sphere(ballRadius),
    material: ballMaterial,
    linearDamping: 0.1,
    angularDamping: 0.1
});
world.addBody(ballBody);

// Ball/Ground Contact
const ballGroundContact = new CANNON.ContactMaterial(ballMaterial, defaultMaterial, {
    friction: 0.4,
    restitution: 0.8 // Bouncy!
});
world.addContactMaterial(ballGroundContact);

// Scoring State
let scores = { team1: 0, team2: 0 };
let ballOwner = null; // socket.id
let lastShotTime = 0;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial state sent to client (without adding them to world yet)
    socket.emit('init', { id: socket.id, players: getPlayersState(), obstacles: obstacles });

    socket.on('joinGame', (data) => {
        if (players[socket.id]) return; // Already joined

        // Team Auto-Assignment
        let team1Count = 0;
        let team2Count = 0;
        for (const id in players) {
            if (players[id].team === 1) team1Count++;
            else if (players[id].team === 2) team2Count++;
        }

        const team = (team1Count <= team2Count) ? 1 : 2;
        const color = (team === 1) ? 0xff0000 : 0x0000ff; // Team 1: Red, Team 2: Blue

        // Use Box to match client AABB Exactly
        const boxSize = new CANNON.Vec3(0.4, 0.8, 0.4);
        const shape = new CANNON.Box(boxSize);

        const body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(team === 1 ? -5 : 5, 5, (Math.random() - 0.5) * 5),
            material: defaultMaterial,
            fixedRotation: true
        });
        body.addShape(shape);

        body.linearDamping = 0.0;
        world.addBody(body);

        const name = data.name || "Player";

        players[socket.id] = {
            id: socket.id,
            body: body,
            input: { x: 0, z: 0, jump: false, yaw: 0, sprint: false, crouch: false, shoot: false },
            color: color,
            team: team,
            yaw: 0,
            name: name
        };

        // Notify everyone 
        io.emit('playerJoined', { id: socket.id, position: body.position, color: color, team: team, yaw: 0, name: name });
        io.emit('notification', `${name} joined Team ${team}!`);
        io.emit('scoreUpdate', scores);
    });

    socket.on('shoot', (data) => {
        if (ballOwner === socket.id) {
            const p = players[socket.id];
            ballOwner = null;
            lastShotTime = Date.now();

            // Release ball at player's head height + forward
            const forward = new CANNON.Vec3(
                -Math.sin(p.yaw),
                0, // Horizontal forward
                -Math.cos(p.yaw)
            );

            // Vertical component from client yaw/pitch if we had it, but let's use a fixed arc for now
            const shootForce = 12;
            ballBody.position.set(
                p.body.position.x + forward.x * 0.7,
                p.body.position.y + 0.8,
                p.body.position.z + forward.z * 0.7
            );

            ballBody.velocity.set(
                forward.x * shootForce,
                shootForce * 0.6, // Arc upward
                forward.z * shootForce
            );

            io.emit('notification', `${p.name} shot the ball!`);
        }
    });

    socket.on('chatMessage', (text) => {
        if (players[socket.id]) {
            const name = players[socket.id].name;
            io.emit('chatMessage', { id: socket.id, name: name, text: text });
        }
    });

    socket.on('input', (data) => {
        if (players[socket.id]) {
            players[socket.id].input = data;
            players[socket.id].yaw = data.yaw || 0;
            // Track last processed sequence number
            players[socket.id].lastSeq = data.seq || 0;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            if (ballOwner === socket.id) ballOwner = null;
            world.removeBody(players[socket.id].body);
            const name = players[socket.id].name;
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            io.emit('notification', `${name} left the game`);
        }
    });
});

function getPlayersState() {
    const state = {
        players: {},
        ball: {
            position: ballBody.position,
            owner: ballOwner
        },
        scores: scores
    };
    for (const id in players) {
        state.players[id] = {
            id: id,
            position: players[id].body.position,
            color: players[id].color,
            team: players[id].team,
            yaw: players[id].yaw,
            crouch: players[id].input.crouch || false,
            name: players[id].name,
            seq: players[id].lastSeq || 0,
            velocity: players[id].body.velocity
        };
    }
    return state;
}

// Fixed timestep loop
setInterval(() => {
    // Apply inputs & Ball logic
    for (const id in players) {
        const p = players[id];
        let speed = p.input.sprint ? 12 : (p.input.crouch ? 4 : 8);

        const currentY = p.body.velocity.y;
        p.body.velocity.set(p.input.x * speed, currentY, p.input.z * speed);

        const isGrounded = p.body.position.y < 1.25;
        if (p.input.jump && isGrounded && !p.input.crouch) {
            p.body.velocity.y = 7;
        }

        // Ball Pickup (if no owner and cooldown passed)
        if (!ballOwner && (Date.now() - lastShotTime > 500)) {
            const dist = p.body.position.distanceTo(ballBody.position);
            if (dist < 1.5) {
                ballOwner = id;
                io.emit('notification', `${p.name} picked up the ball!`);
            }
        }
    }

    // Ball Follow Owner
    if (ballOwner && players[ballOwner]) {
        const p = players[ballOwner];
        const forward = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
        // Position ball in front of player hand
        ballBody.position.set(
            p.body.position.x + forward.x * 0.5,
            p.body.position.y + 0.2,
            p.body.position.z + forward.z * 0.5
        );
        ballBody.velocity.set(0, 0, 0);
    }

    world.step(TIMESTEP);

    // Scoring Detection
    hoops.forEach(hoop => {
        const dist = ballBody.position.distanceTo(new CANNON.Vec3(hoop.position.x, hoop.position.y, hoop.position.z));
        // If ball is very close to hoop center and moving down
        if (dist < 0.6 && ballBody.velocity.y < 0) {
            if (hoop.team === 1) scores.team2++;
            else scores.team1++;

            io.emit('scoreUpdate', scores);
            io.emit('notification', `GOAL! ${hoop.team === 1 ? 'Team 2' : 'Team 1'} scores!`);

            // Reset ball with a slight delay to let it fall through
            ballOwner = null;
            setTimeout(() => {
                ballBody.position.set(0, 5, 0);
                ballBody.velocity.set(0, 0, 0);
                ballBody.angularVelocity.set(0, 0, 0);
            }, 1000);
        }
    });

    io.emit('state', getPlayersState());
}, 1000 * TIMESTEP);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
