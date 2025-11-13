import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "main.js",
              },
            },
          },
        },
      },
      {
        entry: "electron/bridge/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "preload.js",
              },
            },
          },
        },
      },
    ]),
  ],
  server: {
    port: 54321,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "ui-vendor": ["framer-motion", "lucide-react"],
          "utils-vendor": ["clsx", "tailwind-merge"],
          "markdown-vendor": [
            "react-markdown",
            "react-syntax-highlighter",
            "rehype-raw",
            "remark-gfm",
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
