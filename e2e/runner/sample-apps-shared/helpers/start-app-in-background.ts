import { shell } from "../../cypress-runner-utils";

import { logWithPrefix } from "./log-with-prefix";

function cleanup({
  cwd,
  dockerComposePath,
  env,
}: {
  cwd: string;
  dockerComposePath: string;
  env: Record<string, string | number>;
}) {
  shell(`docker compose -f ${dockerComposePath} down --rmi all --volumes`, {
    cwd,
    env,
  });
}

async function waitForHealth(url: string, interval = 5000, timeout = 60000) {
  const startTime = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 503) {
          console.log("Initializing Metabase...");
        } else {
          console.log(`HTTP error: ${response.status}`);
        }
      } else {
        const json = await response.json();
        console.log(`Received response: ${JSON.stringify(json)}`);
        if (json.status === "ok") {
          console.log("Service is healthy!");
          break;
        }
      }
    } catch (error) {}

    if (Date.now() - startTime > timeout) {
      throw new Error(
        'Timeout waiting for /api/health to return {"status": "ok"}',
      );
    }

    // Wait for the specified interval before trying again.
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

export async function startAppInBackground({
  cwd,
  dockerComposePath,
  env,
  loggerPrefix,
}: {
  cwd: string;
  dockerComposePath: string;
  env: Record<string, string | number>;
  loggerPrefix: string;
}) {
  logWithPrefix("Starting app in background...", loggerPrefix);

  cleanup({
    cwd,
    dockerComposePath,
    env,
  });

  try {
    shell(`docker compose -f ${dockerComposePath} up -d`, { cwd, env });

    await waitForHealth(`http://localhost:${env.MB_PORT}/api/health`);
  } catch {
    cleanup({
      cwd,
      dockerComposePath,
      env,
    });
  }

  ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach(signal => {
    process.on(signal, () => {
      logWithPrefix(
        `Parent received ${signal}, killing stopping app...`,
        loggerPrefix,
      );

      cleanup({
        cwd,
        dockerComposePath,
        env,
      });
    });
  });
}
