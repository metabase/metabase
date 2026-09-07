/**
 * Coordinates OpenAPI generation across regular commands and postinstall
 * workers.
 *
 * proper-lockfile owns the cross-process lock, heartbeat, stale recovery, and
 * release mechanics. This wrapper adds the command-specific wait policy: a
 * postinstall worker returns immediately, while regular commands wait for a
 * bounded time before continuing without the lock.
 *
 * The lock avoids duplicate generation; output staging and freshness hashes
 * protect correctness.
 */
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout } from "node:timers";

import { lock } from "proper-lockfile";

export interface WithLockOptions {
  /** When false, return `{ executed: false }` instead of waiting. */
  wait: boolean;
  /** A lock whose mtime is older than this is treated as abandoned. */
  staleMs?: number;
  /** How often the holder refreshes the lock directory's mtime. */
  heartbeatMs?: number;
  /** How often a waiter re-checks the lock. */
  pollMs?: number;
  /** Maximum time to wait before running without the lock. */
  maxWaitMs?: number;
  /** Called once per acquisition when waiting begins. */
  onWait?: (info: { path: string; ageMs: number }) => void;
  /** Called before running without the lock after the maximum wait. */
  onWaitTimeout?: (info: { path: string; waitedMs: number }) => void;
}

export type WithLockResult<T> =
  | { executed: true; result: T }
  | { executed: false };

type ReleaseLock = () => Promise<void>;

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lockAgeMs(lockPath: string): number | undefined {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return undefined;
  }
}

async function tryAcquireLock(
  lockPath: string,
  staleMs: number,
  heartbeatMs: number,
): Promise<ReleaseLock | undefined> {
  try {
    return await lock(lockPath, {
      lockfilePath: lockPath,
      onCompromised: () => {
        // Generation can finish safely after losing this optimization-only lock.
      },
      realpath: false,
      retries: 0,
      stale: staleMs,
      update: heartbeatMs,
    });
  } catch (error) {
    if (hasErrorCode(error, "ELOCKED")) {
      return undefined;
    }
    throw error;
  }
}

export async function withGenerationLock<T>(
  lockPath: string,
  options: WithLockOptions,
  action: () => Promise<T>,
): Promise<WithLockResult<T>> {
  const {
    wait,
    staleMs = 30_000,
    heartbeatMs = 5_000,
    pollMs = 250,
    maxWaitMs = 60_000,
    onWait,
    onWaitTimeout,
  } = options;
  mkdirSync(dirname(lockPath), { recursive: true });
  const waitStartedAt = Date.now();
  let release = await tryAcquireLock(lockPath, staleMs, heartbeatMs);

  if (release === undefined && !wait) {
    return { executed: false };
  }
  if (release === undefined) {
    onWait?.({ path: lockPath, ageMs: lockAgeMs(lockPath) ?? 0 });
  }

  while (release === undefined) {
    const waitedMs = Date.now() - waitStartedAt;
    if (waitedMs >= maxWaitMs) {
      onWaitTimeout?.({ path: lockPath, waitedMs });
      return { executed: true, result: await action() };
    }
    await sleep(Math.min(pollMs, maxWaitMs - waitedMs));
    release = await tryAcquireLock(lockPath, staleMs, heartbeatMs);
  }

  try {
    return { executed: true, result: await action() };
  } finally {
    try {
      await release();
    } catch {
      // Losing or failing to release this optimization-only lock is non-fatal.
    }
  }
}
