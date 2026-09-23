/**
 * Run queue for pipeline jobs (BL-37). Agents append jobs; one daemon runs them.
 *
 *   node src/queue.ts add --kind quality --label sql-mech-minilm --by I -- --corpus sql --text-strategy mech-fill-empty
 *   node src/queue.ts add --kind latency --label scale-10k --by A -- --corpus scale-10000
 *   node src/queue.ts add --kind hold --label i-ollama-window --by I [--max-min 20]
 *   node src/queue.ts release <job id>          # end a hold early
 *   node src/queue.ts pause | resume            # stop/allow new starts; running jobs are untouched
 *   node src/queue.ts status
 *   node src/queue.ts run [--slots 2] [--dry-run] [--once]
 *
 * Kinds:
 *   quality  runs alongside other quality jobs, up to --slots at once (default 2: Ollama is the shared bottleneck).
 *   latency  runs alone: waits for every slot to drain, and nothing new starts until it ends.
 *   hold     exclusive like latency but runs nothing: a reserved window (e.g. an agent's Ollama batch). Ends on
 *            `release`, or after --max-min minutes (default 20) with a logged warning.
 * Jobs start in file order; an exclusive job blocks everything queued behind it (no overtaking).
 *
 * Files (hackathon/harness/runner/queue/): jobs.jsonl (append-only job list), events.jsonl (append-only
 * start/end/release/warn/orphaned), logs/<id>.log, `paused` (flag file). The daemon assigns --port itself from
 * 3021-3040, skipping ports something is listening on. Pipeline args must not include --port.
 * A job started by a previous daemon that is still running is tracked to its end; one whose process is gone is
 * marked orphaned (reported, never re-run).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import pg from "pg";

import { isMain } from "./config.ts";

const RUNNER = resolve(import.meta.dirname, "..");
/** HARNESS_QUEUE_DIR overrides the queue directory (tests). */
const QDIR = process.env.HARNESS_QUEUE_DIR ?? resolve(RUNNER, "queue");
const JOBS = resolve(QDIR, "jobs.jsonl");
const EVENTS = resolve(QDIR, "events.jsonl");
const LOGS = resolve(QDIR, "logs");
const PAUSED = resolve(QDIR, "paused");
const PORTS = Array.from({ length: 20 }, (_, i) => 3021 + i);

type Kind = "quality" | "latency" | "hold";
export type Job = { id: string; kind: Kind; label: string; by: string; args: string[]; maxMin?: number; createdAt: string };
type Event = {
  t: string;
  id: string;
  ev: "start" | "end" | "release" | "warn" | "orphaned";
  port?: number;
  pid?: number;
  exit?: number | null;
  runIds?: string[];
  durationMs?: number;
  log?: string;
  note?: string;
};

const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exclusive = (j: Job) => j.kind !== "quality";

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}
function append(path: string, obj: unknown) {
  mkdirSync(QDIR, { recursive: true });
  appendFileSync(path, JSON.stringify(obj) + "\n"); // one small O_APPEND write: safe for concurrent appenders
}
const event = (e: Omit<Event, "t">) => append(EVENTS, { t: now(), ...e });

/**
 * Mirror job windows into harness.harness_job for latency hygiene (G's concurrency view). Fail-soft: the queue
 * never stops over a DB error. Off in --dry-run.
 */
let pool: pg.Pool | undefined;
let dbEnabled = true;
async function db(sql: string, params: unknown[]) {
  if (!dbEnabled) return;
  try {
    pool ??= new pg.Pool({
      connectionString: process.env.HARNESS_DB_URL ?? "postgres://postgres:postgres@localhost:55432/harness",
      max: 2,
    });
    await pool.query(sql, params);
  } catch (e) {
    console.warn(`[queue] harness_job write failed (continuing): ${(e as Error).message}`);
  }
}
const dbJobStart = (j: Job, port: number | undefined) =>
  db(
    `INSERT INTO harness_job (job_id, kind, label, requested_by, port, started_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (job_id) DO NOTHING`,
    [j.id, j.kind, j.label, j.by, port ?? null],
  );
const dbJobEnd = (id: string, exit: number | null, runIds: string[]) =>
  db(`UPDATE harness_job SET finished_at = now(), exit_code = $2, run_ids = $3 WHERE job_id = $1`, [id, exit, runIds]);

function state() {
  const jobs = readJsonl<Job>(JOBS);
  const events = readJsonl<Event>(EVENTS);
  const byId = new Map<string, Event[]>();
  for (const e of events) byId.set(e.id, [...(byId.get(e.id) ?? []), e]);
  const status = (j: Job) => {
    const evs = byId.get(j.id) ?? [];
    if (evs.some((e) => e.ev === "end")) return "done";
    if (evs.some((e) => e.ev === "start")) return "running";
    return "pending";
  };
  return { jobs, byId, status };
}

function portFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.listen(port, () => s.close(() => ok(true)));
  });
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------------
// Daemon

async function run({ slots, dryRun, once }: { slots: number; dryRun: boolean; once: boolean }) {
  mkdirSync(LOGS, { recursive: true });
  dbEnabled = !dryRun;
  /** Jobs this daemon (or a previous one, if still alive) is running: id → { port, pid, startedAt }. */
  const running = new Map<string, { job: Job; port?: number; pid?: number; startedAt: number }>();

  // Adopt or orphan jobs a previous daemon left running.
  {
    const { jobs, byId, status } = state();
    for (const j of jobs.filter((j) => status(j) === "running")) {
      const start = byId.get(j.id)!.find((e) => e.ev === "start")!;
      if (j.kind === "hold" || (start.pid && alive(start.pid))) {
        running.set(j.id, { job: j, port: start.port, pid: start.pid, startedAt: Date.parse(start.t) });
        console.log(`[queue] adopted running ${j.kind} job ${j.id} (${j.label})`);
      } else {
        event({ id: j.id, ev: "orphaned", note: "started by a previous daemon; process gone" });
        event({ id: j.id, ev: "end", exit: null, note: "orphaned" });
        await dbJobEnd(j.id, null, []);
        console.log(`[queue] orphaned ${j.id} (${j.label})`);
      }
    }
  }

  console.log(`[queue] running: slots=${slots}${dryRun ? " (dry-run)" : ""}; jobs in ${JOBS}`);
  for (;;) {
    const { jobs, byId, status } = state();

    // Finish holds: released, or past their max duration.
    for (const [id, r] of running) {
      if (r.job.kind !== "hold") continue;
      const maxMs = (r.job.maxMin ?? 20) * 60_000;
      if ((byId.get(id) ?? []).some((e) => e.ev === "release")) {
        event({ id, ev: "end", durationMs: Date.now() - r.startedAt, note: "released" });
        await dbJobEnd(id, null, []);
        running.delete(id);
      } else if (Date.now() - r.startedAt > maxMs) {
        event({ id, ev: "warn", note: `hold exceeded ${r.job.maxMin ?? 20} min; auto-released` });
        event({ id, ev: "end", durationMs: Date.now() - r.startedAt, note: "auto-released" });
        await dbJobEnd(id, null, []);
        console.warn(`[queue] WARNING: hold ${id} (${r.job.label}) auto-released after ${r.job.maxMin ?? 20} min`);
        running.delete(id);
      }
    }
    // Adopted processes from a previous daemon: end them when the pid is gone (exit code unknowable).
    for (const [id, r] of running) {
      if (r.job.kind !== "hold" && !selfSpawned.has(id) && r.pid && !alive(r.pid)) {
        event({ id, ev: "end", exit: null, durationMs: Date.now() - r.startedAt, note: "adopted; exit code unknown" });
        await dbJobEnd(id, null, []);
        running.delete(id);
      }
    }

    // Start what may start, strictly in file order.
    if (!existsSync(PAUSED)) {
      const busy = new Set([...running.values()].map((r) => r.port).filter((p): p is number => p !== undefined));
      for (const job of jobs.filter((j) => status(j) === "pending")) {
        const runningExclusive = [...running.values()].some((r) => exclusive(r.job));
        if (runningExclusive) break;
        if (exclusive(job)) {
          if (running.size === 0) await start(job, busy);
          break; // nothing overtakes an exclusive job
        }
        if (running.size >= slots) break;
        await start(job, busy);
      }
    }

    if (once && running.size === 0 && jobs.every((j) => status(j) !== "pending")) {
      console.log("[queue] --once: queue drained");
      await pool?.end();
      return;
    }
    await sleep(2000);
  }

  async function start(job: Job, busy: Set<number>) {
    if (job.kind === "hold") {
      event({ id: job.id, ev: "start", note: `hold, max ${job.maxMin ?? 20} min` });
      await dbJobStart(job, undefined);
      running.set(job.id, { job, startedAt: Date.now() });
      console.log(`[queue] hold ${job.id} (${job.label}) started`);
      return;
    }
    let port: number | undefined;
    for (const p of PORTS) {
      if (!busy.has(p) && (await portFree(p))) {
        port = p;
        break;
      }
    }
    if (port === undefined) {
      console.warn(`[queue] no free port in ${PORTS[0]}-${PORTS.at(-1)}; ${job.id} waits`);
      return;
    }
    busy.add(port);
    const logPath = resolve(LOGS, `${job.id}.log`);
    // The child writes straight to a file descriptor, never through a pipe to this process.
    const fd = openSync(logPath, "a");
    // --dry-run: each job sleeps for its first numeric arg in seconds (default 3) instead of running a pipeline.
    const [cmd, args] = dryRun
      ? ["sleep", [String(Number(job.args.find((a) => /^\d+$/.test(a)) ?? 3))]]
      : [process.execPath, ["src/pipeline.ts", ...job.args, "--port", String(port)]];
    // HARNESS_JOB_ID reaches run.ts, which stamps it on every run the job produces (harness_run.job_id).
    const child = spawn(cmd, args, { cwd: RUNNER, stdio: ["ignore", fd, fd], env: { ...process.env, HARNESS_JOB_ID: job.id } });
    const startedAt = Date.now();
    selfSpawned.add(job.id);
    running.set(job.id, { job, port, pid: child.pid, startedAt });
    event({ id: job.id, ev: "start", port, pid: child.pid, log: logPath });
    await dbJobStart(job, port);
    console.log(`[queue] ${job.kind} ${job.id} (${job.label}) started on :${port}, pid ${child.pid}`);
    child.on("exit", (code) => {
      const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      const runIds = log.match(/done: runs (.+)/)?.[1].split(",").map((s) => s.trim()) ?? [];
      event({ id: job.id, ev: "end", exit: code, runIds, durationMs: Date.now() - startedAt, port });
      void dbJobEnd(job.id, code, runIds);
      running.delete(job.id);
      console.log(`[queue] ${job.id} (${job.label}) ended exit=${code} runs=${runIds.join(",") || "-"}`);
    });
  }
}
const selfSpawned = new Set<string>();

// ---------------------------------------------------------------------------------------------------
// CLI

function add(argv: string[]) {
  const dash = argv.indexOf("--");
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const args = dash === -1 ? [] : argv.slice(dash + 1);
  const { values } = parseArgs({
    args: own,
    options: {
      kind: { type: "string" },
      label: { type: "string" },
      by: { type: "string", default: "?" },
      "max-min": { type: "string" },
    },
  });
  const kind = values.kind as Kind;
  if (!["quality", "latency", "hold"].includes(kind)) throw new Error("--kind must be quality, latency or hold");
  if (!values.label) throw new Error("--label is required");
  if (args.includes("--port")) throw new Error("don't pass --port: the queue assigns it");
  if (kind === "hold" && args.length) throw new Error("a hold job runs nothing: no pipeline args");
  const job: Job = {
    id: `${new Date().toISOString().slice(11, 19).replace(/:/g, "")}-${randomBytes(2).toString("hex")}`,
    kind,
    label: values.label,
    by: values.by!,
    args,
    ...(kind === "hold" && { maxMin: Number(values["max-min"] ?? 20) }),
    createdAt: now(),
  };
  append(JOBS, job);
  console.log(`queued ${job.kind} ${job.id} (${job.label})`);
}

function printStatus() {
  const { jobs, byId, status } = state();
  console.log(existsSync(PAUSED) ? "PAUSED (no new starts)" : "accepting starts");
  for (const j of jobs) {
    const evs = byId.get(j.id) ?? [];
    const start = evs.find((e) => e.ev === "start");
    const end = evs.find((e) => e.ev === "end");
    const extra = end
      ? `exit=${end.exit ?? "?"} runs=${end.runIds?.join(",") || "-"} ${end.note ?? ""}`
      : start
        ? `since ${start.t.slice(11, 19)}${start.port ? ` :${start.port}` : ""}`
        : "";
    console.log(`${status(j).padEnd(8)} ${j.id} ${j.kind.padEnd(7)} ${j.label.padEnd(28)} by ${j.by.padEnd(4)} ${extra}`);
  }
}

if (isMain(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  mkdirSync(QDIR, { recursive: true });
  if (cmd === "add") add(rest);
  else if (cmd === "status") printStatus();
  else if (cmd === "release") {
    if (!rest[0]) throw new Error("release <job id>");
    event({ id: rest[0], ev: "release" });
    console.log(`release requested for ${rest[0]}`);
  } else if (cmd === "pause") {
    writeFileSync(PAUSED, now());
    console.log("paused: no new starts");
  } else if (cmd === "resume") {
    rmSync(PAUSED, { force: true });
    console.log("resumed");
  } else if (cmd === "run") {
    const { values } = parseArgs({
      args: rest,
      options: { slots: { type: "string", default: "2" }, "dry-run": { type: "boolean" }, once: { type: "boolean" } },
    });
    await run({ slots: Number(values.slots), dryRun: !!values["dry-run"], once: !!values.once });
  } else {
    console.log("usage: queue.ts add|status|release <id>|pause|resume|run [--slots N] [--dry-run] [--once]");
    process.exitCode = 1;
  }
}
