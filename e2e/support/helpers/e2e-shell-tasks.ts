import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

export type RunCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Runs an executable with an argument array, without a shell.
 * By default, a non-zero exit code rejects, and the test fails.
 * Set `failOnNonZeroExit: false` to get the exit code and the output back.
 */
export function runCommand({
  command,
  args = [],
  cwd,
  env,
  failOnNonZeroExit = true,
}: {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  failOnNonZeroExit?: boolean;
}): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        env: { ...process.env, ...env },
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        // A string code (for example, ENOENT) means the command did not start.
        if (typeof error?.code === "string") {
          reject(error);
          return;
        }

        // A process killed by a signal has no exit code.
        const exitCode = error ? (error.code ?? 1) : 0;

        if (exitCode !== 0 && failOnNonZeroExit) {
          reject(
            new Error(
              `${command} ${args.join(" ")} exited with code ${exitCode}\n${stderr}`,
            ),
          );
          return;
        }

        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}

export function hashFile({ path }: { path: string }): string {
  return createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

/** A request from the config process does not show in the browser logs. */
export async function isUrlReachable({ url }: { url: string }) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
