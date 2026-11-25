import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/bitunix-api': {
        target: 'https://fapi.bitunix.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bitunix-api/, ''),
      },
    },
  },
});
