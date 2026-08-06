#!/usr/bin/env node

/**
 * Finds Loki story files affected by changes in a PR.
 *
 * Uses dependency-cruiser's --affected flag to find all modules that
 * transitively depend on changed files, then filters to story files.
 *
 * Usage:
 *   node scripts/affected-stories.mjs [base_ref]
 *
 * Output:
 *   Comma-separated story file paths on stdout (for STORYBOOK_STORIES_FILTER)
 *
 * Exit codes:
 *   0 - paths on stdout (or empty if no stories affected)
 *   2 - all stories affected, run everything
 */

import { execSync } from "child_process";

const baseRef = process.argv[2] || "origin/master";
const ALL_STORIES_THRESHOLD = 0.8;

function isStoryFile(filePath) {
  return /\.stories\.(ts|tsx|js|jsx)$/.test(filePath);
}

let graph;
try {
  const output = execSync(
    `bunx depcruise frontend/src --affected ${baseRef} --config .dependency-cruiser.stories.mjs --output-type json`,
    { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 },
  );
  graph = JSON.parse(output);
} catch {
  process.stderr.write("No frontend changes detected\n");
  process.exit(0);
}

const affectedStories = graph.modules
  .map((m) => m.source)
  .filter(isStoryFile);

// Quick count of all stories to decide if we should just run everything.
const allStoriesOutput = execSync(
  "find frontend/src -name '*.stories.ts' -o -name '*.stories.tsx' | grep -v node_modules || true",
  { encoding: "utf8" },
).trim();
const totalStories = allStoriesOutput ? allStoriesOutput.split("\n").length : 0;

if (totalStories === 0) {
  process.exit(0);
}

const ratio = affectedStories.length / totalStories;

if (ratio >= ALL_STORIES_THRESHOLD) {
  process.stderr.write(
    `${affectedStories.length}/${totalStories} stories affected (${(ratio * 100).toFixed(0)}%) — run all\n`,
  );
  process.exit(2);
}

if (affectedStories.length > 0) {
  process.stderr.write(
    `${affectedStories.length}/${totalStories} stories affected (${(ratio * 100).toFixed(0)}%)\n`,
  );
  process.stdout.write(affectedStories.join(",") + "\n");
} else {
  process.stderr.write("No stories affected\n");
}
