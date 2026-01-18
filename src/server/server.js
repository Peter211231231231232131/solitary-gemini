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

// Generate Random Obstacles
for (let i = 0; i < 20; i++) {
    const size = { x: Math.random() * 2 + 1, y: Math.random() * 5 + 1, z: Math.random() * 2 + 1 };
    const position = { x: (Math.random() - 0.5) * 40, y: size.y / 2, z: (Math.random() - 0.5) * 40 };

    const boxShape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const boxBody = new CANNON.Body({ mass: 0, material: defaultMaterial }); // Mass 0 = static
    boxBody.addShape(boxShape);
    boxBody.position.set(position.x, position.y, position.z);
    world.addBody(boxBody);

    obstacles.push({ position, size, id: `box_${i}` });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial state sent to client (without adding them to world yet)
    socket.emit('init', { id: socket.id, players: getPlayersState(), obstacles: obstacles });

    socket.on('joinGame', (data) => {
        if (players[socket.id]) return; // Already joined

        // Create player body - Capsule shape (cylinder + 2 spheres at ends)
        // Capsule: height 1.5, radius 0.4
        const capsuleRadius = 0.4;
        const capsuleHeight = 1.5;

        const body = new CANNON.Body({
            mass: 1, // kg
            position: new CANNON.Vec3(0, 5, 0), // Spawn position
            material: defaultMaterial,
            fixedRotation: true
        });

        const cylinderShape = new CANNON.Cylinder(capsuleRadius, capsuleRadius, capsuleHeight, 8);
        body.addShape(cylinderShape, new CANNON.Vec3(0, 0, 0));

        const topSphere = new CANNON.Sphere(capsuleRadius);
        body.addShape(topSphere, new CANNON.Vec3(0, capsuleHeight / 2, 0));

        const bottomSphere = new CANNON.Sphere(capsuleRadius);
        body.addShape(bottomSphere, new CANNON.Vec3(0, -capsuleHeight / 2, 0));

        body.linearDamping = 0.9;
        world.addBody(body);

        const color = '#' + Math.floor(Math.random() * 16777215).toString(16);
        const name = data.name || "Player";

        players[socket.id] = {
            id: socket.id,
            body: body,
            input: { x: 0, z: 0, jump: false, yaw: 0, sprint: false, crouch: false },
            color: color,
            yaw: 0,
            name: name
        };

        // Notify everyone (including self to spawn mesh)
        io.emit('playerJoined', { id: socket.id, position: body.position, color: color, yaw: 0, name: name });
        io.emit('notification', `${name} joined the game`);
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
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            world.removeBody(players[socket.id].body);
            const name = players[socket.id].name;
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
            io.emit('notification', `${name} left the game`);
        }
    });
});

function getPlayersState() {
    const state = {};
    for (const id in players) {
        state[id] = {
            id: id,
            position: players[id].body.position,
            quaternion: players[id].body.quaternion,
            color: players[id].color,
            yaw: players[id].yaw,
            crouch: players[id].input.crouch || false,
            name: players[id].name
        };
    }
    return state;
}

// Fixed timestep loop
setInterval(() => {
    // Apply inputs
    for (const id in players) {
        const p = players[id];

        // Speed modifiers
        let speed = 8; // Base speed
        if (p.input.sprint) {
            speed = 12; // Sprint speed
        } else if (p.input.crouch) {
            speed = 4; // Crouch speed (slower)
        }

        // Preserve Y velocity (gravity)
        const currentY = p.body.velocity.y;

        // Set horizontal velocity from input
        p.body.velocity.set(p.input.x * speed, currentY, p.input.z * speed);

        // Jump with better ground check (y position near ground)
        // Cannot jump while crouching
        const isGrounded = p.body.position.y < 2.0 && Math.abs(currentY) < 0.5;
        if (p.input.jump && isGrounded && !p.input.crouch) {
            p.body.velocity.y = 7; // Jump velocity
        }
    }

    world.step(TIMESTEP);

    io.emit('state', getPlayersState());
}, 1000 * TIMESTEP);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
