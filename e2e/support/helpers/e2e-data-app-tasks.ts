import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_APP_BUILD_SCRIPT,
  DATA_APP_FIXTURES_DIR,
  REPO_ROOT,
} from "./data-app-fixture-paths.mjs";

/**
 * Cypress task: build a data-app fixture and return its bundle code.
 */
export async function buildDataApp({
  appName,
}: {
  appName: string;
}): Promise<string> {
  const appDir = path.join(DATA_APP_FIXTURES_DIR, appName);

  if (!fs.existsSync(path.join(appDir, "src"))) {
    throw new Error(`data-app fixture "${appName}" has no src/ at ${appDir}`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [DATA_APP_BUILD_SCRIPT, appName], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `data-app build for "${appName}" exited with code ${code}`,
            ),
          ),
    );
  });

  const bundlePath = path.join(DATA_APP_FIXTURES_DIR, appName, "dist/index.js");

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `data-app build for "${appName}" produced no bundle at ${bundlePath}`,
    );
  }

  return fs.readFileSync(bundlePath, "utf8");
}
