import { shell } from "../../../cypress-runner-utils";
import { waitForHealth } from "../../shared/helpers/wait-for-health";

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
}
