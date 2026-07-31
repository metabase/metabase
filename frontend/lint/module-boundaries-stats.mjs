/**
 * Computes the weekly module-boundary stats uploaded to stats.metabase.com by
 * .github/workflows/module-boundaries-stats.yml. Prints KEY=value lines
 * suitable for appending to $GITHUB_OUTPUT.
 */
import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";

import { elements } from "./module-boundaries.mjs";

// catch-all buckets that aren't real modules
const EXCLUDED_TYPES = ["shared/other", "app/misc", "other"];

export function getNamedModules(elements) {
  return new Set(
    elements
      .filter((element) => !EXCLUDED_TYPES.includes(element.type))
      .map((element) => element.type),
  );
}

export function getEnforcedModules(elements) {
  return new Set(
    elements
      .filter(
        (element) =>
          element.enforceOutgoing && !EXCLUDED_TYPES.includes(element.type),
      )
      .map((element) => element.type),
  );
}

export function getUnmoduledFolders(elements, folders) {
  const namedDirs = new Set();
  for (const element of elements) {
    const match = element.pattern.match(
      /^frontend\/src\/metabase\/(\w[\w-]*)\//,
    );
    if (match) {
      namedDirs.add(match[1]);
    }
  }
  return folders.filter((folder) => !namedDirs.has(folder));
}

function getViolationCount() {
  let output;
  try {
    output = execFileSync("bun", ["run", "module-boundaries"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // eslint exits non-zero when there are violations
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const match = output.match(/✖ (\d+) problems?/);
  return match ? Number(match[1]) : 0;
}

function main() {
  const folders = readdirSync("frontend/src/metabase", {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  console.log(`NAMED_MODULES=${getNamedModules(elements).size}`);
  console.log(`ENFORCED_MODULES=${getEnforcedModules(elements).size}`);
  console.log(`UNMODULED=${getUnmoduledFolders(elements, folders).length}`);
  console.log(`VIOLATIONS=${getViolationCount()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
