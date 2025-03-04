import { delay, shell } from "../../cypress-runner-utils";

const HEALTH_CHECK_ATTEMPTS_COUNT = 60 * 5;
const HEALTH_CHECK_WAIT_TIME_MS = 1000;

async function waitForHealth(url: string) {
  for (let i = 0; i < HEALTH_CHECK_ATTEMPTS_COUNT; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log("Metabase is ready");
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
}: {
  cwd: string;
  env: Record<string, string | number>;
  dockerUpCommand: string;
  dockerDownCommand: string;
}) {
  console.log("Starting app in background...");

  try {
    shell(`${dockerUpCommand} -d`, { cwd, env });

    await waitForHealth(`http://localhost:${env.MB_PORT}/api/health`);
  } catch {
    shell(dockerDownCommand, { cwd, env });
  }

  if (!process.env.CI) {
    ["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach(signal => {
      process.on(signal, () => {
        console.log(`Parent received ${signal}, killing stopping app...`);

        shell(dockerDownCommand, { cwd, env });
      });
    });
  }
}
