/**
 * Aggregates per-spec coverage files written by the after:spec hook in
 * e2e/support/config.js into a single spec → modules manifest.
 *
 * Run after a full instrumented e2e pass:
 *   INSTRUMENT_COVERAGE=true bun run build-release:js
 *   <run cypress>
 *   node e2e/coverage/build-coverage-manifest.mjs
 *
 * Output: e2e/coverage/spec-module-manifest.json
 */

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT, fileToModule } from "./file-to-module.mjs";

const PER_SPEC_DIR = path.join(REPO_ROOT, "e2e/coverage-manifest");
const OUTPUT_FILE = path.join(REPO_ROOT, "e2e/coverage/spec-module-manifest.json");

function main() {
  if (!fs.existsSync(PER_SPEC_DIR)) {
    console.error(`No per-spec coverage at ${PER_SPEC_DIR}.`);
    console.error("Run the instrumented Cypress pass first.");
    process.exit(1);
  }

  const manifest = {};
  let unmapped = 0;

  for (const file of fs.readdirSync(PER_SPEC_DIR)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const { spec, files } = JSON.parse(
      fs.readFileSync(path.join(PER_SPEC_DIR, file), "utf8"),
    );
    const modules = new Set();
    for (const f of files) {
      const m = fileToModule(f);
      if (m) {
        modules.add(m);
      } else {
        unmapped += 1;
      }
    }
    manifest[spec] = [...modules].sort();
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
  const specCount = Object.keys(manifest).length;
  console.log(`Wrote ${OUTPUT_FILE} (${specCount} specs).`);
  if (unmapped > 0) {
    console.log(`Note: ${unmapped} files matched no module (node_modules/cljs/build output).`);
  }
}

main();
