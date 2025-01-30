import { spawn } from "child_process";

import { logWithPrefix } from "./log-with-prefix";

export function startAppInBackground({
  cwd,
  startCommand,
  loggerPrefix,
}: {
  cwd: string;
  startCommand: string[];
  loggerPrefix: string;
}) {
  logWithPrefix("Starting app in background...", loggerPrefix);

  const child = spawn("yarn", ["run", ...startCommand], {
    cwd,
    detached: true,
    stdio: "ignore",
  });

  ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach(signal => {
    process.on(signal, () => {
      logWithPrefix(
        `Parent received ${signal}, killing process with PID=${child.pid}...`,
        loggerPrefix,
      );
      try {
        if (child.pid) {
          process.kill(child.pid);
        }
      } catch {}
    });
  });

  logWithPrefix(
    `Launched the process with PID=${child.pid} in background.`,
    loggerPrefix,
  );
}
