import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [
    compression({ algorithm: 'gzip', threshold: 1024 })
  ]
});
