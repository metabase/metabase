import { shell } from "../../../cypress-runner-utils";
import { waitForHealth } from "../../shared/helpers/wait-for-health";

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
