import { shell } from "../../../cypress-runner-utils";
import { waitForHealth } from "../../shared/helpers/wait-for-health";

import { getLogsCommand } from "./get-logs-command";

export async function startContainers({
  cwd,
  env,
  appName,
  dockerUpCommand,
  dockerDownCommand,
  healthcheckPorts,
}: {
  cwd: string;
  env: Record<string, string | number>;
  appName: string;
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

    shell(getLogsCommand(appName));
  } catch (err) {
    shell(getLogsCommand(appName));
    shell(dockerDownCommand, { cwd, env });
    throw err;
  }
}
