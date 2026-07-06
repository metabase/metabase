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

/**
 * SDK source that provides `dataAppConfig` — the same entry the template imports
 * as `@metabase/embedding-sdk-react/data-app-dev`. We bundle it from source at
 * build time (see build-data-app-fixture.mjs) rather than importing a prebuilt
 * `dist/`, since regular e2e doesn't build the SDK package.
 */
export const SDK_DATA_APP_DEV_SOURCE = path.join(
  REPO_ROOT,
  "enterprise/frontend/src/embedding-sdk-package/data-app-dev.ts",
);

/**
 * Root of the `build-configs` path alias used inside the SDK dev-config source.
 * Needed to resolve its `build-configs/*` imports when bundling from source.
 */
export const BUILD_CONFIGS_DIR = path.join(REPO_ROOT, "frontend/build");
