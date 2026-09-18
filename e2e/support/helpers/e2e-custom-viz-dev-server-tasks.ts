import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT = 30_000;
const SHUTDOWN_TIMEOUT = 10_000;
const POLL_INTERVAL = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(
  url: string,
  timeoutMs: number,
  logFilePath: string,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      console.log("Dev server not up yet, keep polling");
    }
    await sleep(POLL_INTERVAL);
  }

  throw new Error(
    `Dev server did not become ready: ${url} (see spawn log at ${logFilePath})`,
  );
}

async function waitForConnectionRefused(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
    } catch {
      return true;
    }
    await sleep(POLL_INTERVAL);
  }

  return false;
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

type StartCustomVizDevServerArgs = {
  cwd: string;
  port?: number;
};

let running: DevServerHandle | null = null;

type DevServerHandle = {
  pid: number;
  url: string;
};

export async function startCustomVizDevServer(
  args: StartCustomVizDevServerArgs,
): Promise<DevServerHandle> {
  const port = args.port ?? 5174;

  if (running) {
    await stopCustomVizDevServer(running.pid);
  }

  const logFilePath = join(tmpdir(), `custom-viz-dev-server-${Date.now()}.log`);
  const logStream = createWriteStream(logFilePath);
  const child = spawn("npm", ["run", "dev"], {
    cwd: args.cwd,
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start custom-viz dev server (no pid)");
  }

  const url = `http://localhost:${port}`;

  // Ensure the dev server is ready and serving the manifest.
  await waitForHttpOk(`${url}/metabase-plugin.json`, TIMEOUT, logFilePath);
  running = { pid: child.pid, url };
  console.log(`Custom viz dev server started at ${url} (log: ${logFilePath})`);

  return running;
}

export async function stopCustomVizDevServer(pid: number): Promise<null> {
  if (!pid) {
    return null;
  }

  const handle = running?.pid === pid ? running : null;
  if (handle) {
    running = null;
  }

  killProcessGroup(pid, "SIGTERM");

  if (!handle) {
    return null;
  }

  const manifestUrl = `${handle.url}/metabase-plugin.json`;
  if (await waitForConnectionRefused(manifestUrl, SHUTDOWN_TIMEOUT)) {
    return null;
  }

  killProcessGroup(pid, "SIGKILL");
  if (await waitForConnectionRefused(manifestUrl, SHUTDOWN_TIMEOUT)) {
    return null;
  }

  throw new Error(
    `Custom viz dev server still responding after SIGKILL: ${handle.url}`,
  );
}
