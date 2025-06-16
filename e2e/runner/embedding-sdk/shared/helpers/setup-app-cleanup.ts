import fs from "fs";

import { shell } from "../../../cypress-runner-utils";

export function setupAppCleanup({
  rootPath,
  env,
  appDownCommand,
  cleanupAppDir,
}: {
  rootPath: string;
  env: Record<string, string | number>;
  appDownCommand: string;
  cleanupAppDir: boolean;
}) {
  if (!process.env.CI) {
    ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach((signal) => {
      process.on(signal, () => {
        console.log(`Parent received ${signal}, stopping app...`);

        shell(appDownCommand, { cwd: rootPath, env });

        if (cleanupAppDir) {
          fs.rmSync(rootPath, { recursive: true, force: true });
        }
      });
    });
  }
}
