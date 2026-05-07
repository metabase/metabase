/**
 * Builds the e2e custom-viz fixtures from source.
 *
 * Outputs:
 *   - e2e/support/assets/example_custom_viz_plugin.tgz  (manifest: demo-viz)
 *   - e2e/support/assets/example_custom_viz_plugin_2.tgz (manifest: demo-viz-2)
 *
 * The Storybook calendar-heatmap fixture is NOT built here — it's imported
 * directly from source by the storybook helper, no bundling required.
 *
 * Run with:
 *
 *   bun run build:custom-viz-fixtures
 */
/* global console */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../..");
const E2E_ASSETS = resolve(REPO_ROOT, "e2e/support/assets");

await buildDemoViz();

async function buildDemoViz() {
  const root = resolve(__dirname, "demo-viz");
  const stage = resolve(root, ".stage");

  rmSync(stage, { recursive: true, force: true });
  mkdirSync(resolve(stage, "dist/assets"), { recursive: true });

  // Bundle the React-based plugin into a single IIFE. We bundle React
  // itself: real customer plugins also self-contain React, and the
  // sandbox doesn't expose a host React on `__METABASE_VIZ_API__`.
  await build({
    entryPoints: [resolve(root, "src/index.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    outfile: resolve(stage, "dist/index.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "none",
    minify: true,
  });

  // Copy declared assets next to the bundle.
  copyFileSync(
    resolve(root, "public/thumbs.svg"),
    resolve(stage, "dist/assets/thumbs.svg"),
  );

  // Pack one tarball per manifest variant. The bundle byte-content is
  // identical between demo-viz and demo-viz-2 — the existing fixtures we
  // replaced have the same property — only the manifest's `name` and
  // `metabase.version` differ.
  const variants = [
    {
      manifest: "demo-viz.json",
      out: "example_custom_viz_plugin.tgz",
    },
    {
      manifest: "demo-viz-2.json",
      out: "example_custom_viz_plugin_2.tgz",
    },
  ];

  for (const { manifest, out } of variants) {
    cpSync(
      resolve(root, "manifests", manifest),
      resolve(stage, "metabase-plugin.json"),
    );

    const outPath = resolve(E2E_ASSETS, out);
    execFileSync(
      "tar",
      ["-czf", outPath, "-C", stage, "metabase-plugin.json", "dist"],
      { stdio: "inherit" },
    );
    const { size } = statSync(outPath);
    console.log(`Packed ${out} (${(size / 1024).toFixed(1)} KiB)`);
  }

  rmSync(stage, { recursive: true, force: true });
}
