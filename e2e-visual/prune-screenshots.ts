import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { SNAPSHOT_DIR } from "./paths";
import { getSnapshotName, loadStories, selectStories } from "./storybook";

const expected = new Set(
  selectStories(loadStories(), { files: [], grep: undefined }).map(
    getSnapshotName,
  ),
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
