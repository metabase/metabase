/**
 * Per-worker backend experiment: each Playwright worker gets its own Metabase
 * JVM on its own port with its own H2 app DB and sample-database copy, so
 * restore() calls can't collide across workers.
 *
 * Enabled with PW_PER_WORKER_BACKEND=1. Reuses e2e/runner/start-backend.js
 * (source mode, --hot), so the shared rspack dev server on :8080 must be up.
 */
import { execSync, spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { SnowplowCollector, collectorPortFor } from "./snowplow-collector";

const REPO_ROOT = path.resolve(__dirname, "../..");

export type WorkerBackend = {
  port: number;
  startupMs: number;
  /**
   * This slot's private Snowplow collector. The backend is booted pointing at
   * it, so BACKEND-emitted events (`analytics/snowplow.clj track-event!`, which
   * POSTs from the JVM and never touches the browser) are observable here.
   * Frontend-emitted events keep being captured at the browser boundary by
   * `installSnowplowCapture` — the two mechanisms are independent.
   */
  snowplow: SnowplowCollector;
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

/**
 * Whether an already-running backend is pointed at this slot's collector.
 *
 * `snowplow-url` is fixed at backend boot — `snowplow.clj` builds its `Tracker`
 * in a `defonce` whose `network-config` reads the setting once — so a backend
 * booted without the wiring below can never be re-pointed. Reusing one would
 * leave every backend-event assertion silently unobservable (and, worse, send
 * its events wherever it was booted to). Cheaper to detect and reboot.
 */
async function pointsAtCollector(port: number, collectorUrl: string) {
  // Retried: this runs against a backend the health probe just confirmed
  // alive, so a single slow /api/session/properties (GC pause, loaded box)
  // must not read as "wrong collector" — that verdict kills the backend and
  // costs a ~70s reboot.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `http://localhost:${port}/api/session/properties`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) {
        return false;
      }
      const properties = (await response.json()) as Record<string, unknown>;
      return properties["snowplow-url"] === collectorUrl;
    } catch {
      // timed out or dropped mid-flight — try again
    }
  }
  return false;
}

/**
 * Is something already serving this slot? "healthy" / "empty" / after retries
 * still unresponsive -> "empty" (boot will then fail loudly on the bound port
 * rather than us silently wiping a live backend's disk).
 *
 * The distinction that matters: a CLOSED port refuses in milliseconds, while a
 * live-but-slow backend (contended CI runner, GC pause) TIMES OUT. The old
 * single 1s probe conflated the two — a slow healthy backend read as "empty",
 * after which the caller rmSync'd the running JVM's H2 files out from under it
 * and booted a second JVM onto the bound port, which failed as "backend
 * crashed". Refusal exits fast, so the retries cost nothing on a genuinely
 * empty slot.
 */
async function probeSlotHealth(port: number): Promise<"healthy" | "empty"> {
  const timeouts = [1000, 3000, 5000];
  for (const timeout of timeouts) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) {
        return "healthy";
      }
      // Listening but unhealthy (booting, wedged): treat as empty; the
      // caller's killPort path handles the survivor.
      return "empty";
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === "ECONNREFUSED") {
        return "empty";
      }
      // Timeout or reset — could be a slow live backend; retry longer.
    }
  }
  return "empty";
}

function killPort(port: number) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      process.kill(Number(pid), "SIGKILL");
    }
  } catch {
    // nothing listening
  }
}

export async function startWorkerBackend(
  slot: number,
): Promise<WorkerBackend> {
  const port = 4100 + slot;
  const nreplPort = 4600 + slot;
  const collectorPort = collectorPortFor(port);

  // Start the collector BEFORE the backend can exist, so nothing emitted
  // during boot (e.g. `account`/`new_instance_created`, which fires the first
  // time the `instance-creation` setting is read) escapes unobserved.
  const snowplow = new SnowplowCollector();
  await snowplow.start(collectorPort);
  const collectorUrl = snowplow.url;

  if ((await probeSlotHealth(port)) === "healthy") {
    if (await pointsAtCollector(port, collectorUrl)) {
      return {
        port,
        startupMs: 0,
        sampleDbUrl: slotSampleDbUrl(slot),
        snowplow,
        stop: () => {},
      };
    }
    // Healthy, but booted against some other collector (a pre-change slot
    // backend, or one carrying leaked MB_SNOWPLOW_URL). Replace it.
    console.log(
      `[slot ${slot}] backend on :${port} is not pointed at ${collectorUrl} — rebooting it`,
    );
    killPort(port);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const scratch = slotDir(slot);
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  const sampleDbDir = path.join(scratch, "sample-db");
  fs.mkdirSync(sampleDbDir);
  // Local dev extracts the sample DB to e2e/tmp; in CI the jar-mode backend
  // extracts it into the repo-root plugins dir.
  const sampleDbSources = [
    path.join(REPO_ROOT, "e2e/tmp/sample-database.db.mv.db"),
    path.join(REPO_ROOT, "plugins/sample-database.db.mv.db"),
  ];
  const sampleDbSource = sampleDbSources.find((candidate) =>
    fs.existsSync(candidate),
  );
  if (!sampleDbSource) {
    throw new Error(
      `Sample database file not found; looked in:\n${sampleDbSources.join("\n")}`,
    );
  }
  fs.copyFileSync(
    sampleDbSource,
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
      // The e2e snapshots were captured against the standard :4000 dev
      // backend, so they carry site-url=http://localhost:4000 — and restore()
      // reinstates it. The frontend prefixes root-relative navigation targets
      // with site-url (getWithSiteUrl in utils/dom.ts, via openUrl), so on a
      // slot backend every click-behavior/drill-through navigation leaves for
      // :4000 — a different backend that doesn't have the test's data ("We're
      // a little lost"). Settings read env before the app DB, so this pins the
      // correct origin and survives restore().
      MB_SITE_URL: `http://localhost:${port}`,
      MB_DB_FILE: path.join(scratch, "metabase.db"),
      MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR: sampleDbDir,
      // Concurrent boots race on extracting instance_analytics into the
      // shared cwd-relative plugins/ dir — give each backend its own.
      MB_PLUGINS_DIR: path.join(scratch, "plugins"),
      NREPL_PORT: String(nreplPort),
      // Point this slot's backend at its OWN snowplow collector.
      //
      // Why a system property and not MB_SNOWPLOW_URL: settings resolve through
      // `environ`, whose `env` map is `(merge … (read-system-env)
      // (read-system-props))` — system properties WIN over environment
      // variables. `deps.edn`'s `:e2e` alias already sets
      // `-Dmb.snowplow.url=http://localhost:9090` (snowplow-micro's fixed port),
      // and `e2e/runner/cypress-runner-backend.js` applies that alias's jvm-opts
      // via JDK_JAVA_OPTIONS in BOTH jar and source mode — and overwrites
      // JDK_JAVA_OPTIONS unconditionally, so we cannot append there either.
      // MEASURED (slot 4101, jar 751c2a98): booting with
      // MB_SNOWPLOW_URL=http://localhost:5999 left `snowplow-url` reporting
      // `http://localhost:9090`; booting with the `_JAVA_OPTIONS` below made it
      // report `http://localhost:5101`. `_JAVA_OPTIONS` is the one channel the
      // JVM applies AFTER the command line, so it wins over the alias.
      //
      // Two things this buys, beyond making backend events observable:
      //  - Isolation: micro has ONE global store on ONE fixed port, which
      //    `resetSnowplow` wipes; per-slot collectors cannot trample each other.
      //  - Safety: nothing this backend emits can leave the machine. See
      //    findings-inbox/per-slot-snowplow-collector.md.
      //
      // `mb.snowplow.available` is already true via the same alias; it is
      // repeated here so the wiring does not depend on that staying true.
      _JAVA_OPTIONS: [
        process.env._JAVA_OPTIONS,
        `-Dmb.snowplow.url=${collectorUrl}`,
        "-Dmb.snowplow.available=true",
      ]
        .filter(Boolean)
        .join(" "),
      // On memory-tight CI runners, cap each worker JVM's heap (deps.edn's
      // :e2e opts set no -Xmx, so JAVA_TOOL_OPTIONS survives; JVM default
      // would be 25% of machine RAM per backend). e.g. PW_WORKER_MAX_HEAP=1500m
      ...(process.env.PW_WORKER_MAX_HEAP
        ? {
            JAVA_TOOL_OPTIONS: [
              process.env.JAVA_TOOL_OPTIONS,
              `-Xmx${process.env.PW_WORKER_MAX_HEAP}`,
            ]
              .filter(Boolean)
              .join(" "),
          }
        : {}),
    },
  });
  proc.unref();

  const logTail = () => {
    try {
      const text = fs.readFileSync(logPath, "utf8");
      return text.split("\n").slice(-40).join("\n");
    } catch {
      return "(backend.log unreadable)";
    }
  };
  // The launcher process (node start-backend.js) is NOT the backend. It spawns
  // the JVM detached, waits until it's ready, `unref()`s it, and then returns —
  // so on CI the launcher exits `code 0 / signal null` while the detached JVM
  // keeps serving (confirmed from backend.log: "Backend ready on :PORT" then a
  // clean code-0 exit, JVM still healthy). Because the reuse model relies on
  // the JVM outliving its launcher, that exit is expected, not a death. The old
  // check treated ANY launcher exit as fatal, which raced the health probe and
  // produced the w2-only "backend exited (code 0)" flake for healthy backends.
  //
  // So: a non-zero exit or a signalled exit is a genuine launch failure and
  // fails fast. A clean (code 0) exit is not fatal on its own — confirm via
  // the health probe. Only if the launcher has exited AND the backend still
  // isn't healthy within a short grace do we conclude it really didn't come up.
  const healthUrl = `http://localhost:${port}/api/health`;
  const deadline = Date.now() + 10 * 60_000;
  let graceDeadline = Infinity;
  while (Date.now() < deadline) {
    const crashed =
      (proc.exitCode != null && proc.exitCode !== 0) || proc.signalCode != null;
    if (crashed) {
      throw new Error(
        `Worker ${slot} backend on :${port} crashed after ${Math.round(
          (Date.now() - startedAt) / 1000,
        )}s (code=${proc.exitCode}, signal=${proc.signalCode}); log: ${logPath}\n--- backend.log tail ---\n${logTail()}`,
      );
    }
    // Launcher exited cleanly (code 0): the JVM should be up. Give the health
    // probe a bounded window rather than the full 10-min deadline.
    if (proc.exitCode === 0 && graceDeadline === Infinity) {
      graceDeadline = Date.now() + 30_000;
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
    if (Date.now() > graceDeadline) {
      throw new Error(
        `Worker ${slot} backend on :${port} launcher exited (code 0) but the backend never became healthy; log: ${logPath}\n--- backend.log tail ---\n${logTail()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (Date.now() >= deadline) {
    throw new Error(
      `Worker ${slot} backend not healthy after 10min; log: ${logPath}\n--- backend.log tail ---\n${logTail()}`,
    );
  }

  const sampleDbUrl = slotSampleDbUrl(slot);
  await warmUp(port, sampleDbUrl);

  return {
    port,
    startupMs: Date.now() - startedAt,
    sampleDbUrl,
    snowplow,
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
