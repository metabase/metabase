import type { SpawnOptions } from "child_process";

import spawn from "spawn-streaming";

export function spawnPromise({
  cmd,
  args,
  options,
  loggerPrefix,
}: {
  cmd: string;
  args: string[];
  options: SpawnOptions;
  loggerPrefix: string;
}) {
  return spawn(
    cmd,
    args,
    { stdio: "inherit", ...options },
    { prefix: loggerPrefix },
  );
}
