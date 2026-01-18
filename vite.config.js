import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: 'src/client',
    publicDir: '../../public',
    build: {
        outDir: '../../dist',
        emptyOutDir: true,
    },
    server: {
        port: 8080,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    }
});
