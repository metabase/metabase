/**
 * Per-worker backend experiment: each Playwright worker gets its own Metabase
 * JVM on its own port with its own H2 app DB and sample-database copy, so
 * restore() calls can't collide across workers.
 *
 * Enabled with PW_PER_WORKER_BACKEND=1. Reuses e2e/runner/start-backend.js
 * (source mode, --hot), so the shared rspack dev server on :8080 must be up.
 */
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

export type WorkerBackend = {
  port: number;
  startupMs: number;
  /**
   * H2 connection string for this worker's private copy of the sample
   * database. The snapshots pin database 1 to the shared e2e/tmp H2 file,
   * which only one JVM can hold open — every backend beyond the first fails
   * with "Database may be already in use". After each restore, database 1
   * must be re-pointed at this URL (MetabaseHarness.restore does this).
   */
  sampleDbUrl: string;
  stop: () => void;
};

function slotDir(slot: number) {
  return path.join(os.tmpdir(), `mb-pw-slot-${slot}`);
}

function slotSampleDbUrl(slot: number) {
  return `file:${path.join(slotDir(slot), "sample-database.db")};USER=GUEST;PASSWORD=guest`;
}

/**
 * `slot` is workerInfo.parallelIndex — stable across worker replacements
 * (workerIndex increments every time a failed worker is replaced). If a
 * backend from a previous worker is still healthy on this slot's port, reuse
 * it instead of booting another JVM: a worker replacement then costs nothing
 * instead of a ~70s boot. Backends are cleaned up in global teardown.
 */
/**
 * A just-booted backend fails its first sample-database query (QP/driver
 * init under boot load), which broke the first test on each worker. Restore
 * a snapshot and retry a real query until it completes before handing the
 * backend to tests.
 */
async function warmUp(port: number, sampleDbUrl: string) {
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 300_000;

  let restored = false;
  while (!restored && Date.now() < deadline) {
    const restore = await fetch(`${base}/api/testing/restore/default`, {
      method: "POST",
      // A restore can hang on a booting backend — never let one request
      // eat the whole budget.
      signal: AbortSignal.timeout(60_000),
    }).catch((error) => {
      console.log(`[warmup :${port}] restore: ${error.cause ?? error}`);
      return null;
    });
    if (restore?.ok) {
      restored = true;
    } else {
      if (restore) {
        console.log(`[warmup :${port}] restore -> ${restore.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!restored) {
    throw new Error(`Backend on :${port} restore did not succeed in 300s`);
  }

  const session = await (
    await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin@metabase.test",
        password: "12341234",
      }),
      signal: AbortSignal.timeout(30_000),
    })
  ).json();

  const repoint = await fetch(`${base}/api/database/1`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Session": session.id,
    },
    body: JSON.stringify({ details: { db: sampleDbUrl } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!repoint.ok) {
    throw new Error(
      `Backend on :${port} sample-db repoint failed: ${repoint.status} ${await repoint.text()}`,
    );
  }

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/dataset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Metabase-Session": session.id,
        },
        body: JSON.stringify({
          database: 1,
          type: "query",
          query: { "source-table": 5, aggregation: [["count"]] },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json();
      if (body.status === "completed") {
        return;
      }
      console.log(`[warmup :${port}] query status: ${body.status}`);
    } catch (error) {
      console.log(`[warmup :${port}] query: ${error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Backend on :${port} failed warm-up query after 300s`);
}

export async function startWorkerBackend(
  slot: number,
): Promise<WorkerBackend> {
  const port = 4100 + slot;
  const nreplPort = 4600 + slot;

  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      return {
        port,
        startupMs: 0,
        sampleDbUrl: slotSampleDbUrl(slot),
        stop: () => {},
      };
    }
  } catch {
    // nothing on this slot yet — boot one
  }
  const scratch = slotDir(slot);
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  const sampleDbDir = path.join(scratch, "sample-db");
  fs.mkdirSync(sampleDbDir);
  fs.copyFileSync(
    path.join(REPO_ROOT, "e2e/tmp/sample-database.db.mv.db"),
    path.join(scratch, "sample-database.db.mv.db"),
  );

  const logPath = path.join(scratch, "backend.log");
  const logFile = fs.openSync(logPath, "w");

  const startedAt = Date.now();
  const proc: ChildProcess = spawn("node", ["e2e/runner/start-backend.js"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFile, logFile],
    env: {
      ...process.env,
      MB_JETTY_PORT: String(port),
      MB_DB_FILE: path.join(scratch, "metabase.db"),
      MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR: sampleDbDir,
      // Concurrent boots race on extracting instance_analytics into the
      // shared cwd-relative plugins/ dir — give each backend its own.
      MB_PLUGINS_DIR: path.join(scratch, "plugins"),
      NREPL_PORT: String(nreplPort),
    },
  });
  proc.unref();

  const healthUrl = `http://localhost:${port}/api/health`;
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode != null) {
      throw new Error(
        `Worker ${slot} backend exited (code ${proc.exitCode}); log: ${logPath}`,
      );
    }
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (Date.now() >= deadline) {
    throw new Error(
      `Worker ${slot} backend not healthy after 10min; log: ${logPath}`,
    );
  }

  const sampleDbUrl = slotSampleDbUrl(slot);
  await warmUp(port, sampleDbUrl);

  return {
    port,
    startupMs: Date.now() - startedAt,
    sampleDbUrl,
    stop: () => {
      // start-backend.js spawns the JVM detached in its own group; kill the
      // whole group so the JVM dies with the wrapper.
      try {
        process.kill(-proc.pid!, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
    },
  };
}
