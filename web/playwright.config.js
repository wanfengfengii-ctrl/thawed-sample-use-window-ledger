import { defineConfig } from "@playwright/test";

// In Docker verify: http://web:80 (nginx -> FastAPI -> PostgreSQL).
// Locally: start web (default 8080) and api (8000), or override BASE_URL.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
});
