import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import micromatch from "micromatch";

import { MAIN_APP_STORY_GLOBS } from "../.storybook/story-files.cjs";

import { SNAPSHOT_DIR } from "./paths";
import { getSnapshotName, loadStories, selectStories } from "./storybook";

const REPO_ROOT = path.resolve(__dirname, "..");

const stories = loadStories();
assertFullBuild(stories.map((story) => story.importPath));

const expected = new Set(
  selectStories(stories, { files: [], grep: undefined }).map(getSnapshotName),
);

const stale = existsSync(SNAPSHOT_DIR)
  ? readdirSync(SNAPSHOT_DIR).filter(
      (file) => file.endsWith(".png") && !expected.has(file),
    )
  : [];

for (const file of stale) {
  rmSync(path.join(SNAPSHOT_DIR, file));
  console.log(`Removed ${file}`);
}
console.log(`Removed ${stale.length} screenshots with no matching story`);

function assertFullBuild(importPaths: string[]) {
  const indexed = new Set(importPaths.map((file) => file.replace(/^\.\//, "")));
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--", "frontend", "enterprise/frontend"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
  const missing = micromatch(tracked, MAIN_APP_STORY_GLOBS, {
    dot: true,
  }).filter((file) => !indexed.has(file));

  if (missing.length > 0) {
    throw new Error(
      `The Storybook index has no stories from ${missing.length} story files, such as ${missing.slice(0, 3).join(", ")}. ` +
        "Pruning against a narrowed build would delete their screenshots, so build every story first.",
    );
  }
}
