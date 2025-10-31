import { shell } from "../../../cypress-runner-utils";
import { waitForHealth } from "../../shared/helpers/wait-for-health";

export async function startContainers({
  cwd,
  env,
  dockerUpCommand,
  dockerDownCommand,
  appName,
  healthcheckPorts,
}: {
  cwd: string;
  env: Record<string, string | number>;
  dockerUpCommand: string;
  dockerDownCommand: string;
  appName: string;
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
    // docker compose up failed, grab recent logs
    shell(`docker logs --tail 100 ${appName}-metabase-1`, { cwd, env });

    setTimeout(() => {
      shell(dockerDownCommand, { cwd, env });
    }, 5000);
  }
}
