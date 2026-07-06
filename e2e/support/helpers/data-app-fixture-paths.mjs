// Shared filesystem locations for the data-app E2E fixtures, used by both the
// `buildDataApp` Cypress task (e2e-data-app-tasks.ts) and the standalone Vite
// builder it spawns (build-data-app-fixture.mjs). Plain `.mjs` so both a Node
// process and the bundled Cypress config can import it.
import fs from "node:fs";
import path from "node:path";

/**
 * Locate the metabase repo root by walking up from `start` until the data-app
 * fixture + create-data-app template markers exist. Robust to cwd: the Cypress
 * config process runs from `e2e/support`, the build script from the repo root.
 */
export function findRepoRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (
      fs.existsSync(path.join(dir, "e2e/support/assets/data-apps")) &&
      fs.existsSync(path.join(dir, "skills/create-data-app/template"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`could not locate the metabase repo root from ${start}`);
}

export const REPO_ROOT = findRepoRoot();

/** The `create-data-app` template scaffolded over each fixture's src at build. */
export const DATA_APP_TEMPLATE_DIR = path.join(
  REPO_ROOT,
  "skills/create-data-app/template",
);

/** Root holding one directory per data-app E2E fixture (`<name>/src/`). */
export const DATA_APP_FIXTURES_DIR = path.join(
  REPO_ROOT,
  "e2e/support/assets/data-apps",
);

/** The standalone Vite builder the `buildDataApp` task spawns. */
export const DATA_APP_BUILD_SCRIPT = path.join(
  REPO_ROOT,
  "e2e/support/helpers/build-data-app-fixture.mjs",
);

/** The locally built SDK's data-app-dev entry (provides `dataAppConfig`). */
export const SDK_DATA_APP_DEV_ENTRY = path.join(
  REPO_ROOT,
  "resources/embedding-sdk/dist/data-app-dev.js",
);
