import { execFileSync } from "node:child_process";
import path from "node:path";

export const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

export const DATA_APP_FIXTURES_DIR = path.join(
  REPO_ROOT,
  "e2e/support/assets/data-apps",
);

export const DATA_APP_BUILD_SCRIPT = path.join(
  REPO_ROOT,
  "e2e/support/helpers/build-data-app-fixture.mjs",
);

export const SDK_DATA_APP_DEV_SOURCE = path.join(
  REPO_ROOT,
  "enterprise/frontend/src/embedding-sdk-package/data-app-dev.ts",
);

export const BUILD_CONFIGS_DIR = path.join(REPO_ROOT, "frontend/build");
