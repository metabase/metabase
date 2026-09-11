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

/** Cypress resolves a relative path against the project root; match that. */
function inRepo(target: string) {
  return path.isAbsolute(target) ? target : path.join(REPO_ROOT, target);
}

/**
 * The fixture filesystem lives behind tasks rather than `cy.exec`/`cy.writeFile`
 * so a spec changes an app in one round trip, and so nothing is composed into a
 * shell string.
 */
export async function scaffoldDataApp({
  appName,
  sdkFrom,
}: {
  appName: string;
  sdkFrom: string;
}): Promise<string> {
  // The task owns the location so a caller cannot aim the `rmSync` below elsewhere.
  if (path.basename(appName) !== appName) {
    throw new Error(`A scaffolded app is named, not located: ${appName}`);
  }

  const root = path.join(REPO_ROOT, "e2e", "tmp", appName);

  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  // The SDK the app synchronizes against, without a second npm install.
  fs.symlinkSync(
    path.join(inRepo(sdkFrom), "node_modules"),
    path.join(root, "node_modules"),
  );
  fs.writeFileSync(
    path.join(root, "data_app.yaml"),
    `name: ${appName}\npath: ./dist/index.js\n`,
  );

  return root;
}

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

export async function removeDataAppDeclaration({
  filePath,
  exportName,
}: {
  filePath: string;
  exportName: string;
}): Promise<null> {
  const target = inRepo(filePath);
  const [imports, ...declarations] = fs
    .readFileSync(target, "utf8")
    .split("export const ");

  fs.writeFileSync(
    target,
    imports +
      declarations
        .filter((declaration) => !declaration.startsWith(`${exportName} `))
        .map((declaration) => `export const ${declaration}`)
        .join(""),
  );

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
