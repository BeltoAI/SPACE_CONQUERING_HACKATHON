import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
    include: ['three', 'react-globe.gl']
  },
  build: {
    // three.js + react-globe.gl is large; bump the warning threshold so
    // the build output stays clean.
    chunkSizeWarningLimit: 2000
  }
});
