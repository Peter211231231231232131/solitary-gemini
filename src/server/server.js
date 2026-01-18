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

    // Create player body
    const radius = 1;
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
        mass: 1, // kg
        position: new CANNON.Vec3(0, 10, 0), // Spawn higher
        material: defaultMaterial,
        fixedRotation: true
    });
    body.addShape(shape);
    body.linearDamping = 0.9;
    world.addBody(body);

    const color = '#' + Math.floor(Math.random() * 16777215).toString(16);

    players[socket.id] = {
        id: socket.id,
        body: body,
        input: { x: 0, z: 0, jump: false, yaw: 0 },
        color: color,
        yaw: 0
    };

    socket.emit('init', { id: socket.id, players: getPlayersState(), obstacles: obstacles });
    socket.broadcast.emit('playerJoined', { id: socket.id, position: body.position, color: color, yaw: 0 });

    socket.on('input', (data) => {
        if (players[socket.id]) {
            players[socket.id].input = data;
            // Update yaw immediately from input as it doesn't need physics simulation
            players[socket.id].yaw = data.yaw || 0;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            world.removeBody(players[socket.id].body);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
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
            yaw: players[id].yaw
        };
    }
    return state;
}

// Fixed timestep loop
setInterval(() => {
    // Apply inputs
    for (const id in players) {
        const p = players[id];
        const inputSpeed = 10;

        // Simple movement logic (velocity based)
        // Reset X/Z velocity to handle movement stops immediately (simplified)
        // In a real physics game you'd apply forces, but for FPS movement usually setting velocity is easier for responsiveness

        // We preserve Y velocity (gravity)
        const currentY = p.body.velocity.y;

        // Simple WASD logic assumes input is a direction vector
        // In reality we need camera direction.
        // For now, let's assume inputs are relative to world for simplicity or camera logic is handled client side and sent as direction.
        // Let's assume input.x and input.z are world-space direction components sent by client.

        p.body.velocity.set(p.input.x * inputSpeed, currentY, p.input.z * inputSpeed);

        if (p.input.jump && Math.abs(currentY) < 0.1) { // Floating point epsilon for grounded check
            p.body.velocity.y = 5;
        }
    }

    world.step(TIMESTEP);

    io.emit('state', getPlayersState());
}, 1000 * TIMESTEP);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
