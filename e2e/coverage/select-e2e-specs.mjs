/**
 * Emits the set of e2e specs to run for the current PR, based on which
 * frontend modules have changed against origin/master. Reads the manifest
 * built by build-coverage-manifest.mjs.
 *
 * Usage:
 *   node e2e/coverage/select-e2e-specs.mjs [--base=origin/master]
 *
 * Prints one spec path per line on stdout (consumable by `cypress run --spec`).
 * Specs not yet in the manifest (newly added) are always included as a safe
 * fallback. If the manifest is missing, all specs are emitted.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT, fileToModule } from "./file-to-module.mjs";

const MANIFEST_FILE = path.join(REPO_ROOT, "e2e/coverage/spec-module-manifest.json");
const SPEC_GLOB_ROOT = path.join(REPO_ROOT, "e2e/test");

const base =
  process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length) ??
  "origin/master";

function findSpecs() {
  return execSync("find . -name '*.cy.spec.*' -type f", {
    cwd: SPEC_GLOB_ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((p) => path.posix.join("e2e/test", p.replace(/^\.\//, "")));
}

function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`No manifest at ${MANIFEST_FILE}; running all specs.`);
    console.log(findSpecs().join("\n"));
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  const changed = execSync(`git diff --name-only ${base}...HEAD`, {
    encoding: "utf8",
    cwd: REPO_ROOT,
  })
    .trim()
    .split("\n")
    .filter(Boolean);

  const changedModules = new Set();
  for (const file of changed) {
    const module = fileToModule(file);
    if (module) {
      changedModules.add(module);
    }
  }

  if (changedModules.size === 0) {
    console.error("No frontend module changes detected.");
    return;
  }

  const selected = new Set();
  for (const [spec, mods] of Object.entries(manifest)) {
    if (mods.some((m) => changedModules.has(m))) {
      selected.add(spec);
    }
  }

  // Always include specs that aren't in the manifest yet (newly added).
  for (const spec of findSpecs()) {
    if (!(spec in manifest)) {
      selected.add(spec);
    }
  }

  console.error(
    `Selected ${selected.size} specs from ${changedModules.size} changed modules: ${[...changedModules].sort().join(", ")}`,
  );
  console.log([...selected].sort().join("\n"));
}

main();
