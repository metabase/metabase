import { spawn } from "node:child_process";

const TIMEOUT = 10_000;
const POLL_INTERVAL = 250;

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      console.log(`${url} is not up yet`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error(`Dev server did not become ready: ${url}`);
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
    stopCustomVizDevServer(running.pid);
  }

  const child = spawn("npm", ["run", "dev"], {
    cwd: args.cwd,
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start custom-viz dev server (no pid)");
  }

  const url = `http://localhost:${port}`;

  // Ensure the dev server is ready and serving the manifest.
  await waitForHttpOk(`${url}/metabase-plugin.json`, TIMEOUT);
  running = { pid: child.pid, url };
  console.log(`Custom viz dev server started at ${url}`);

  return running;
}

export function stopCustomVizDevServer(pid: number): null {
  if (!pid) {
    return null;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }

  if (running?.pid === pid) {
    running = null;
  }

  return null;
}
