import { delay, shell } from "../../cypress-runner-utils";

const HEALTH_CHECK_ATTEMPTS_COUNT = 60 * 5;
const HEALTH_CHECK_WAIT_TIME_MS = 1000;

async function waitForHealth(url: string, identifier: string) {
  for (let i = 0; i < HEALTH_CHECK_ATTEMPTS_COUNT; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`${identifier} is ready`);
        return;
      }
    } catch {}

    console.log("Initializing Metabase...");
    await delay(HEALTH_CHECK_WAIT_TIME_MS);
  }

  throw new Error("Metabase instance is not ready");
}

export async function startContainers({
  cwd,
  env,
  dockerUpCommand,
  dockerDownCommand,
  healthcheckPorts,
}: {
  cwd: string;
  env: Record<string, string | number>;
  dockerUpCommand: string;
  dockerDownCommand: string;
  healthcheckPorts: number[];
}) {
  console.log("Starting app in background...");

  try {
    shell(`${dockerUpCommand} -d`, { cwd, env });

    const healthcheckPromises = healthcheckPorts.map((port) => {
      if (port === env.MB_PORT) {
        return waitForHealth(`http://localhost:${port}/api/health`, "Metabase");
      }

      return waitForHealth(`http://localhost:${port}`, `Sample App: ${port}`);
    });

    await Promise.all(healthcheckPromises);
  } catch {
    shell(dockerDownCommand, { cwd, env });
  }
}
