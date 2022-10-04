import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 8082,
    },
    base: process.env.NODE_ENV === 'production' ? '/game/slgs/' : '/',
});
