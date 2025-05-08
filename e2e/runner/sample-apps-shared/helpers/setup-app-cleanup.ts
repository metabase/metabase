import fs from "fs";

import { shell } from "../../cypress-runner-utils";

export function setupAppCleanup({
  rootPath,
  env,
  dockerDownCommand,
}: {
  rootPath: string;
  env: Record<string, string | number>;
  dockerDownCommand: string;
}) {
  if (!process.env.CI) {
    ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach((signal) => {
      process.on(signal, () => {
        console.log(`Parent received ${signal}, stopping app...`);

        shell(dockerDownCommand, { cwd: rootPath, env });
        fs.rmSync(rootPath, { recursive: true, force: true });
      });
    });
  }
}
