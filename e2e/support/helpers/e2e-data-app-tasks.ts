import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_APP_BUILD_SCRIPT,
  DATA_APP_FIXTURES_DIR,
  DATA_APP_SYNC_SCRIPT,
  REPO_ROOT,
} from "./data-app-fixture-paths.mjs";

function run(script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "pipe"],
    });

    // Mirrored to the runner as it arrives, and kept so a rejection carries the
    // script's own message rather than a bare exit code.
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              stderr.trim() ||
                `${path.basename(script)} ${args.join(" ")} exited with code ${code}`,
            ),
          ),
    );
  });
}

export async function syncDataApp({
  appRoot,
  metabaseUrl,
  apiKey,
}: {
  appRoot: string;
  metabaseUrl: string;
  apiKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  try {
    await run(DATA_APP_SYNC_SCRIPT, [appRoot], {
      DATA_APP_MB_URL: metabaseUrl,
      DATA_APP_MB_API_KEY: apiKey,
    });
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildDataApp({
  appName,
}: {
  appName: string;
}): Promise<string> {
  const appDir = path.join(DATA_APP_FIXTURES_DIR, appName);

  if (!fs.existsSync(path.join(appDir, "src"))) {
    throw new Error(`data-app fixture "${appName}" has no src/ at ${appDir}`);
  }

  await run(DATA_APP_BUILD_SCRIPT, [appName]);

  const bundlePath = path.join(DATA_APP_FIXTURES_DIR, appName, "dist/index.js");

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `data-app build for "${appName}" produced no bundle at ${bundlePath}`,
    );
  }

  return fs.readFileSync(bundlePath, "utf8");
}
