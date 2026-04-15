import { spawn } from "node:child_process";
import http from "node:http";
import { URL } from "node:url";

type StartCustomVizDevServerArgs = {
  cwd: string;
  port?: number;
};

type DevServerHandle = {
  pid: number;
  url: string;
};

let running: DevServerHandle | null = null;

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        reject(new Error(`Dev server did not become ready: ${url}`));
        return;
      }

      const req = http.get(url, (res) => {
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
        res.resume(); // drain
        if (ok) {
          resolve();
        } else {
          setTimeout(attempt, 250);
        }
      });

      req.on("error", () => {
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

export async function startCustomVizDevServer(
  args: StartCustomVizDevServerArgs,
): Promise<DevServerHandle> {
  const port = args.port ?? 5174;

  if (running) {
    await stopCustomVizDevServer({ pid: running.pid });
  }

  const child = spawn("npm", ["run", "dev"], {
    cwd: args.cwd,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  const url = new URL(`http://localhost:${port}/`)
    .toString()
    .replace(/\/$/, "");

  // Ensure the dev server is ready and serving the manifest.
  await waitForHttpOk(`${url}/metabase-plugin.json`, 60_000);

  running = { pid: child.pid ?? 0, url };
  if (!running.pid) {
    throw new Error("Failed to start custom-viz dev server (no pid)");
  }

  console.log(`Custom viz dev server started at ${running.url}`);

  return running;
}

export async function stopCustomVizDevServer({
  pid,
}: {
  pid: number;
}): Promise<null> {
  if (!pid) {
    return null;
  }

  try {
    // Prefer killing the process group (detached) to avoid orphan children.
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
