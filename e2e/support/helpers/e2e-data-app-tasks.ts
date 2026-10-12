import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_APP_BUILD_SCRIPT,
  DATA_APP_FIXTURES_DIR,
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

/** Cypress resolves a relative path against the project root; match that. */
function inRepo(target: string) {
  return path.isAbsolute(target) ? target : path.join(REPO_ROOT, target);
}

/**
 * The fixture filesystem lives behind tasks rather than `cy.exec`/`cy.writeFile`
 * so a spec changes an app in one round trip, and so nothing is composed into a
 * shell string.
 */
export async function writeDataAppFiles({
  files,
}: {
  files: Record<string, string>;
}): Promise<null> {
  for (const [filePath, contents] of Object.entries(files)) {
    const target = inRepo(filePath);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  return null;
}

export async function removeDataAppPaths({
  paths,
}: {
  paths: string[];
}): Promise<null> {
  for (const target of paths) {
    fs.rmSync(inRepo(target), { recursive: true, force: true });
  }

  return null;
}
