import { exec as execCallback } from "child_process";
import path from "path";
import { promisify } from "util";

import { detect } from "detect-package-manager";
import ora from "ora";
import { match } from "ts-pattern";

const exec = promisify(execCallback);

export const getInstallCommand = async () => {
  const manager = await detect();

  return match(manager)
    .with("npm", () => "npm install")
    .with("yarn", () => "yarn install")
    .with("pnpm", () => "pnpm install")
    .with("bun", () => "bun install")
    .otherwise(() => null);
};

export async function installMockServerDeps(serverDir: string) {
  const command = await getInstallCommand();

  // If the package manager is not supported, do not try to install dependencies.
  if (!command) {
    return;
  }

  const spinner = ora(`Installing mock server dependencies with '${command}'`);
  spinner.start();

  try {
    await exec(command, { cwd: path.resolve(serverDir) });

    spinner.succeed();
  } catch (error) {
    const reason = error instanceof Error ? error.message : error;
    spinner.fail(`Failed to install package: ${reason}`);
  }
}
