import { execSync } from "child_process";

/**
 * Kill any per-worker slot backends (ports 4100-4115) left running by the
 * PW_PER_WORKER_BACKEND experiment. They outlive their workers on purpose so
 * replacement workers can reuse them — see support/fixtures.ts.
 */
export default function globalTeardown() {
  if (!process.env.PW_PER_WORKER_BACKEND) {
    return;
  }
  // Porting agents iterate repeatedly against their own slot backend —
  // keep it alive across runs (the orchestrator reaps slots at wave end).
  if (process.env.PW_KEEP_SLOT_BACKENDS) {
    return;
  }
  for (let slot = 0; slot < 16; slot++) {
    try {
      const pids = execSync(`lsof -ti:${4100 + slot}`, { encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const pid of pids) {
        process.kill(Number(pid), "SIGTERM");
      }
    } catch {
      // nothing on that port
    }
  }
}
