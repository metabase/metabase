import http from "node:http";

import {
  BACKEND_HOST,
  BACKEND_PORT,
} from "../../runner/constants/backend-port";

type RestoreSnapshotArgs = {
  name: string;
  timeoutMs?: number;
  retries?: number;
};

type RestoreSnapshotResult = {
  ok: true;
  attempts: number;
  totalMs: number;
};

function attempt(name: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: `/api/testing/restore/${encodeURIComponent(name)}`,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`restore returned status ${res.statusCode}`));
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`restore timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function restoreSnapshot(
  args: RestoreSnapshotArgs,
): Promise<RestoreSnapshotResult> {
  const { name, timeoutMs = 90_000, retries = 1 } = args;
  const started = Date.now();
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      await attempt(name, timeoutMs);
      return { ok: true, attempts: i + 1, totalMs: Date.now() - started };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[restoreSnapshot] attempt ${i + 1} failed: ${msg}`);
    }
  }
  throw new Error(
    `restoreSnapshot(${name}) failed after ${retries + 1} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

export const restoreTasks = {
  restoreSnapshot,
};
