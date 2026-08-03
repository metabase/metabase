/**
 * Turns the test plan's affected story files into a Loki --storiesFilter regex,
 * so a PR's visual run tests only the stories it can affect.
 *
 * Loki matches its filter against "<kind> <story>" (case-insensitive),
 * and a CLI --storiesFilter replaces the loki.config.js whitelist.
 * Stories outside the whitelist have no reference screenshots
 * and fail on CI (requireReference),
 * so the whitelist is re-applied here before the regex is emitted.
 *
 * Usage: node loki-affected-stories.mjs <test-plan.json> <storybook-index.json>
 * Prints {"count": N, "regex": "..."} to stdout. Count 0 means no affected
 * story survives the whitelist and the Loki run can be skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Selects the stories whose file is in `storyFiles`
// and whose "<title> <name>" passes the whitelist regex Loki normally applies itself.
// `entries` is the storybook index.json entries map (v5).
export function affectedStoriesFilter({ entries, storyFiles, whitelist }) {
  const files = new Set(storyFiles);
  const include = whitelist ? new RegExp(whitelist, "i") : null;
  const names = new Set();
  for (const entry of Object.values(entries)) {
    if (entry.type !== "story") {
      continue;
    }
    const importPath = (entry.importPath || "").replace(/^\.\//, "");
    if (!files.has(importPath)) {
      continue;
    }
    const fullName = `${entry.title} ${entry.name}`;
    if (include && !include.test(fullName)) {
      continue;
    }
    names.add(fullName);
  }
  const sorted = [...names].sort();
  return {
    count: sorted.length,
    regex: sorted.length ? `^(${sorted.map(escapeRegExp).join("|")})$` : "",
  };
}

function main() {
  const [planFile, indexFile] = process.argv.slice(2);
  const { loki_stories_to_run: storyFiles } = JSON.parse(
    fs.readFileSync(planFile, "utf8"),
  );
  const { entries } = JSON.parse(fs.readFileSync(indexFile, "utf8"));

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const require = createRequire(import.meta.url);
  const { storiesFilter: whitelist } = require(
    path.join(repoRoot, "loki.config.js"),
  );

  const result = affectedStoriesFilter({ entries, storyFiles, whitelist });
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
