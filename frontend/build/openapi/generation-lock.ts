/**
 * Coordinates OpenAPI generation across regular commands and postinstall
 * workers.
 *
 * The first process creates the lock file and refreshes its timestamp while it
 * works. Other processes can wait, return without running, or continue without
 * the lock after a timeout. A lock with an expired timestamp is renamed and
 * removed so crashes and interrupted processes don't block future work.
 *
 * The lock avoids duplicate generation; output staging and freshness hashes
 * protect correctness. Each holder writes a unique token and removes the lock
 * only if it still owns it.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { clearInterval, setInterval, setTimeout } from "node:timers";

export interface WithLockOptions {
  /** When false, return `{ executed: false }` instead of waiting. */
  wait: boolean;
  /** A lock whose mtime is older than this is treated as abandoned. */
  staleMs?: number;
  /** How often the holder refreshes the lock file's mtime. */
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

function tryCreateLock(lockPath: string, token: string): boolean {
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(fileDescriptor, JSON.stringify({ pid: process.pid, token }));
    return true;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      return false;
    }
    throw error;
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}

function readLockToken(lockPath: string): string | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
    return typeof value === "object" &&
      value !== null &&
      "token" in value &&
      typeof value.token === "string"
      ? value.token
      : undefined;
  } catch {
    return undefined;
  }
}

function lockAgeMs(lockPath: string): number | undefined {
  try {
    return Date.now() - statSync(lockPath).mtimeMs;
  } catch {
    return undefined;
  }
}

function tryRemoveAbandonedLock(lockPath: string): void {
  const tombstonePath = `${lockPath}.stale.${process.pid}.${randomUUID()}`;
  try {
    renameSync(lockPath, tombstonePath);
  } catch {
    // Another contender removed or claimed it first; nothing to do.
    return;
  }
  rmSync(tombstonePath, { recursive: true, force: true });
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
  const token = randomUUID();
  const waitStartedAt = Date.now();
  let reportedWait = false;

  while (!tryCreateLock(lockPath, token)) {
    const ageMs = lockAgeMs(lockPath);
    if (ageMs !== undefined && ageMs > staleMs) {
      tryRemoveAbandonedLock(lockPath);
      continue;
    }
    if (!wait) {
      return { executed: false };
    }
    if (!reportedWait) {
      onWait?.({ path: lockPath, ageMs: ageMs ?? 0 });
      reportedWait = true;
    }
    const waitedMs = Date.now() - waitStartedAt;
    if (waitedMs >= maxWaitMs) {
      onWaitTimeout?.({ path: lockPath, waitedMs });
      return { executed: true, result: await action() };
    }
    await sleep(pollMs);
  }

  // The heartbeat needs a live event loop: everything running under this lock
  // must use async child processes (`spawn`), never `spawnSync`.
  const heartbeat = setInterval(() => {
    try {
      if (readLockToken(lockPath) === token) {
        const now = new Date();
        utimesSync(lockPath, now, now);
      }
    } catch {
      // The lock was removed or replaced; stop refreshing silently.
    }
  }, heartbeatMs);
  heartbeat.unref();

  try {
    return { executed: true, result: await action() };
  } finally {
    clearInterval(heartbeat);
    if (readLockToken(lockPath) === token) {
      rmSync(lockPath, { force: true });
    }
  }
}
