import { shell } from "../../../cypress-runner-utils";
import { waitForHealth } from "../../shared/helpers/wait-for-health";

export async function startApp({
  cwd,
  env,
  appRunCommand,
  appDownCommand,
}: {
  cwd: string;
  env: Record<string, string | number>;
  appRunCommand: string;
  appDownCommand: string;
}) {
  console.log("Starting app in background...");

  try {
    shell(appRunCommand, { detached: true, cwd, env });

    await waitForHealth(`http://localhost:${env.CLIENT_PORT}`, "Host App");
  } catch {
    shell(appDownCommand, { cwd, env });
  }
}
