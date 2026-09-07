import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withGenerationLock } from "./generation-lock";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function writeForeignLock(lockPath: string, ageMs = 0): void {
  mkdirSync(lockPath, { recursive: true });
  if (ageMs > 0) {
    const past = new Date(Date.now() - ageMs);
    utimesSync(lockPath, past, past);
  }
}

describe("withGenerationLock", () => {
  let directory: string;
  let lockPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "generation-lock-"));
    lockPath = join(directory, "nested", "test.lock");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("runs the action while holding the lock and removes it afterwards", async () => {
    const outcome = await withGenerationLock(
      lockPath,
      { wait: true },
      async () => {
        expect(statSync(lockPath).isDirectory()).toBe(true);
        return "done";
      },
    );
    expect(outcome).toEqual({ executed: true, result: "done" });
    expect(existsSync(lockPath)).toBe(false);
  });

  it("returns executed:false without waiting when the lock is held", async () => {
    writeForeignLock(lockPath);
    const outcome = await withGenerationLock(
      lockPath,
      { wait: false },
      async () => "should not run",
    );
    expect(outcome).toEqual({ executed: false });
    expect(existsSync(lockPath)).toBe(true);
  });

  it("waits for a live holder and acquires after release", async () => {
    const events: string[] = [];
    const holder = withGenerationLock(lockPath, { wait: true }, async () => {
      events.push("holder-start");
      await sleep(300);
      events.push("holder-end");
    });
    await sleep(50);
    const waiter = withGenerationLock(
      lockPath,
      { wait: true, pollMs: 25 },
      async () => {
        events.push("waiter-start");
      },
    );
    await Promise.all([holder, waiter]);
    expect(events).toEqual(["holder-start", "holder-end", "waiter-start"]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("takes over a stale lock directory", async () => {
    writeForeignLock(lockPath, 60_000);
    const outcome = await withGenerationLock(
      lockPath,
      { wait: false, staleMs: 5_000 },
      async () => "recovered",
    );
    expect(outcome).toEqual({ executed: true, result: "recovered" });
    expect(existsSync(lockPath)).toBe(false);
  });

  it("refreshes the lock directory while the action runs", async () => {
    await withGenerationLock(
      lockPath,
      { wait: true, staleMs: 5_000, heartbeatMs: 1_000 },
      async () => {
        const initialMtime = statSync(lockPath).mtimeMs;
        await sleep(1_200);
        expect(statSync(lockPath).mtimeMs).toBeGreaterThan(initialMtime);
      },
    );
  });

  it("reports waiting once with the lock path and holder age", async () => {
    writeForeignLock(lockPath, 5_000);
    const waits: { path: string; ageMs: number }[] = [];
    const waiter = withGenerationLock(
      lockPath,
      { wait: true, pollMs: 25, onWait: (info) => waits.push(info) },
      async () => "ran",
    );
    await sleep(120);
    rmSync(lockPath, { recursive: true, force: true });
    const outcome = await waiter;
    expect(outcome).toEqual({ executed: true, result: "ran" });
    expect(waits).toHaveLength(1);
    expect(waits[0]?.path).toBe(lockPath);
    expect(waits[0]?.ageMs).toBeGreaterThanOrEqual(4_000);
  });

  it("does not spin when an existing lock cannot be statted", async () => {
    mkdirSync(join(lockPath, ".."), { recursive: true });
    symlinkSync(join(directory, "missing"), lockPath);

    const worker = await withGenerationLock(
      lockPath,
      { wait: false },
      async () => "should not run",
    );
    expect(worker).toEqual({ executed: false });

    const waiter = await withGenerationLock(
      lockPath,
      { wait: true, maxWaitMs: 20, pollMs: 5 },
      async () => "ran",
    );
    expect(waiter).toEqual({ executed: true, result: "ran" });
  });

  it("runs without the lock after the maximum wait", async () => {
    writeForeignLock(lockPath);
    const timeouts: string[] = [];
    const outcome = await withGenerationLock(
      lockPath,
      {
        wait: true,
        maxWaitMs: 50,
        pollMs: 10,
        onWaitTimeout: ({ path }) => timeouts.push(path),
      },
      async () => "ran",
    );

    expect(outcome).toEqual({ executed: true, result: "ran" });
    expect(timeouts).toEqual([lockPath]);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("finishes the action when the lock is compromised", async () => {
    const outcome = await withGenerationLock(
      lockPath,
      { wait: true, staleMs: 5_000, heartbeatMs: 1_000 },
      async () => {
        rmSync(lockPath, { recursive: true, force: true });
        await sleep(1_200);
        return "done";
      },
    );

    expect(outcome).toEqual({ executed: true, result: "done" });
  });

  it("releases the lock when the action throws", async () => {
    await expect(
      withGenerationLock(lockPath, { wait: true }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(lockPath)).toBe(false);
  });
});
