/**
 * Builds the e2e custom-viz fixtures from source.
 *
 * Invoked automatically by Cypress `setupNodeEvents`. Can also be run manually:
 *
 *   bun run build:custom-viz-fixtures
 */

/* global console */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../..");
const E2E_ASSETS = resolve(REPO_ROOT, "e2e/support/assets");
const PLUGIN_ROOT = resolve(__dirname, "example_custom_viz_plugin");

const visualizations = [
  {
    index: resolve(PLUGIN_ROOT, "src/index.tsx"),
    manifest: resolve(PLUGIN_ROOT, "manifests/demo-viz.json"),
    out: resolve(E2E_ASSETS, "example_custom_viz_plugin.tgz"),
  },
  {
    index: resolve(PLUGIN_ROOT, "src/index.tsx"),
    manifest: resolve(PLUGIN_ROOT, "manifests/demo-viz-2.json"),
    out: resolve(E2E_ASSETS, "example_custom_viz_plugin_2.tgz"),
  },
  {
    index: resolve(PLUGIN_ROOT, "src/index-widget-security.tsx"),
    manifest: resolve(PLUGIN_ROOT, "manifests/demo-viz-security.json"),
    out: resolve(E2E_ASSETS, "example_custom_viz_plugin_3_security.tgz"),
  },
  {
    index: resolve(PLUGIN_ROOT, "src/index-widget-security-component.tsx"),
    manifest: resolve(PLUGIN_ROOT, "manifests/demo-viz-security-component.json"),
    out: resolve(
      E2E_ASSETS,
      "example_custom_viz_plugin_4_security_component.tgz",
    ),
  },
];

export async function buildCustomVizFixtures() {
  for (const viz of visualizations) {
    await buildDemoViz(viz);
  }
}

await buildCustomVizFixtures();

async function buildDemoViz({ index, manifest, out }) {
  const stage = resolve(PLUGIN_ROOT, ".stage");

  rmSync(stage, { recursive: true, force: true });
  mkdirSync(resolve(stage, "dist/assets"), { recursive: true });

  // Bundle the React-based plugin into a single IIFE. We bundle React
  // itself: real customer plugins also self-contain React, and the
  // sandbox doesn't expose a host React on `__METABASE_VIZ_API__`.
  await build({
    entryPoints: [index],
    bundle: true,
    format: "iife",
    globalName: "__customVizPlugin__",
    footer: {
      js: "globalThis.__customVizPlugin__ = __customVizPlugin__.default;",
    },
    platform: "browser",
    target: "es2020",
    outfile: resolve(stage, "dist/index.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "none",
    minify: true,
  });

  cpSync(manifest, resolve(stage, "metabase-plugin.json"));

  execFileSync(
    "tar",
    ["-czf", out, "-C", stage, "metabase-plugin.json", "dist"],
    { stdio: "inherit" },
  );
  const { size } = statSync(out);
  console.log(`Packed ${out} (${(size / 1024).toFixed(1)} KiB)`);

  rmSync(stage, { recursive: true, force: true });
}
