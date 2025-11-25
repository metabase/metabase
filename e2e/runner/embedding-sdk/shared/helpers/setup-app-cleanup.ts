import fs from "fs";

import { shell } from "../../../cypress-runner-utils";

export function setupAppCleanup({
  appName,
  rootPath,
  env,
  appDownCommand,
  cleanupAppDir,
}: {
  appName: string;
  rootPath: string;
  env: Record<string, string | number>;
  appDownCommand: string;
  cleanupAppDir: boolean;
}) {
  if (!process.env.CI) {
    ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach((signal) => {
      process.on(signal, () => {
        console.log(`Parent received ${signal}, stopping app...`);

        shell(`docker logs ${appName}-metabase-1`);
        shell(appDownCommand, { cwd: rootPath, env });

        if (cleanupAppDir) {
          fs.rmSync(rootPath, { recursive: true, force: true });
        }
      });
    });
  }
}
