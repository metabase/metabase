#!/usr/bin/env bun
//
// Per-driver config status lookup, used by upload-test-results to let an "info"
// driver job pass no matter what. Reads the same ci-test-config the rollup uses
// and writes `status` / `is-info` to $GITHUB_OUTPUT for the driver's exact id.
//
// Run with: DRIVER_ID=drivers-tests-foo bun .github/scripts/drivers-rollup/job-status.ts

import { appendFileSync } from "node:fs";

import { type Status, parseDriversConfig, statusForId } from "./config";

const DEFAULT_CONFIG_URL =
  "https://raw.githubusercontent.com/metabase/ci-test-config/refs/heads/master/ci-test-config.json";

const log = (msg: string) => console.log(`[driver-status] ${msg}`);

function emit(status: Status): void {
  log(`status for '${process.env.DRIVER_ID ?? ""}': ${status}`);
  const out = process.env.GITHUB_OUTPUT;
  const lines = `status=${status}\nis-info=${status === "info"}\n`;
  if (out) {
    appendFileSync(out, lines);
  } else {
    process.stdout.write(lines);
  }
}

async function main(): Promise<void> {
  const id = process.env.DRIVER_ID;
  if (!id) {
    // No id → behave as required (the safe default).
    emit("required");
    return;
  }
  const url = process.env.CONFIG_URL || DEFAULT_CONFIG_URL;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      log(`config HTTP ${res.status}; defaulting to required`);
      emit("required");
      return;
    }
    emit(statusForId(id, parseDriversConfig(await res.json())));
  } catch (error) {
    log(`config fetch failed (${error instanceof Error ? error.message : error}); defaulting to required`);
    emit("required");
  }
}

// Never break a driver job: any failure resolves to "required".
main().catch((error) => {
  log(`unexpected error (${error}); defaulting to required`);
  emit("required");
});
