import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  preview: {
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    // Playwright specs in e2e/ are run by the Playwright runner, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**", "playwright.config.js"],
  },
});
