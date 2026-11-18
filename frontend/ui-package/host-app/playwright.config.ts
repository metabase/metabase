import { defineConfig, devices } from "@playwright/test";

// The same tests run against both bundlers' output; `vite preview` just serves static files.
const BUILDS = [
  { name: "vite", outDir: "dist/vite", port: 4173 },
  { name: "rspack", outDir: "dist/rspack", port: 4174 },
];

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  outputDir: "./test-results",
  reporter: [["list"]],
  projects: BUILDS.map(({ name, port }) => ({
    name,
    use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${port}` },
  })),
  webServer: BUILDS.map(({ outDir, port }) => ({
    command: `npx vite preview --outDir ${outDir} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  })),
});
