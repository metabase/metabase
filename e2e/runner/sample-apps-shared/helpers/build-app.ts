import { logWithPrefix } from "./log-with-prefix";
import { spawnPromise } from "./spawn-promise";

export async function buildApp({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  logWithPrefix("Building app...", loggerPrefix);

  await spawnPromise({
    cmd: "yarn",
    args: ["build"],
    options: { cwd: installationPath },
    loggerPrefix,
  });

  logWithPrefix("Build complete.", loggerPrefix);
}
