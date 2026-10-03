import type { FullConfig } from "@playwright/test";
import { execSync } from "child_process";

import { removeSlotMaildevContainers } from "./maildev";

/**
 * Kill any per-worker slot backends (ports 4100-4115) left running by the
 * PW_PER_WORKER_BACKEND experiment. They outlive their workers on purpose so
 * replacement workers can reuse them — see support/fixtures.ts.
 *
 * Same for the per-slot maildev containers (support/maildev.ts): they outlive
 * their worker so a replacement worker inherits the mailbox, and are reaped
 * here.
 */
export default function globalTeardown(config: FullConfig) {
  if (!process.env.PW_PER_WORKER_BACKEND) {
    return;
  }
  // Porting agents iterate repeatedly against their own slot backend —
  // keep it alive across runs (the orchestrator reaps slots at wave end).
  if (process.env.PW_KEEP_SLOT_BACKENDS) {
    return;
  }
  // Only reap the slots THIS invocation owns. Sweeping 0-15 unconditionally
  // killed concurrent invocations' backends: several agents running on their
  // own PW_SLOT_OFFSET saw each other's runs die mid-test as SIGTERM,
  // "Target page, context or browser has been closed", and socket hang up,
  // and spent time diagnosing those as spec bugs. slot = parallelIndex +
  // PW_SLOT_OFFSET (support/fixtures.ts), and parallelIndex < workers.
  const offset = Number(process.env.PW_SLOT_OFFSET || 0);
  const slots = Array.from(
    { length: Math.max(1, config.workers) },
    (_, i) => offset + i,
  );
  removeSlotMaildevContainers(slots);
  for (const slot of slots) {
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
