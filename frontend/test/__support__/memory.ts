/**
 * Helpers for measuring what a cache retains after its callers are done.
 *
 * Specs using these must run under `--expose-gc --runInBand`, otherwise
 * `canForceGarbageCollection` is false and the measurements are meaningless:
 *
 *   node --expose-gc ./node_modules/.bin/jest --runInBand <spec>
 */

// Node attaches `gc` to the global object only under --expose-gc, so it is
// absent from the ambient typings.
const forceGc = (globalThis as { gc?: () => void }).gc;

export const canForceGarbageCollection = forceGc != null;

/**
 * Call this before measuring. Without --expose-gc a heap measurement silently
 * measures nothing, and a memory test that cannot measure must fail rather than
 * report a vacuous pass.
 */
export function requireGarbageCollection() {
  if (!canForceGarbageCollection) {
    throw new Error(
      "This spec measures heap retention and needs --expose-gc. Run `bun run test-memory`.",
    );
  }
}

export function collectGarbage() {
  forceGc?.();
  forceGc?.();
}

function heapUsedMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/**
 * Megabytes still held once `run` has returned and everything it allocated has
 * gone out of scope. Only something outliving the call can show up here.
 */
export function measureRetainedMb(run: () => void): number {
  collectGarbage();
  const before = heapUsedMb();
  run();
  collectGarbage();
  return heapUsedMb() - before;
}

/**
 * Lets the frames still holding a just-returned value unwind, so a WeakRef to
 * it can actually be collected. Without this the control arm of a retention
 * test survives too and the test discriminates nothing.
 */
export async function settleAndCollect(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  collectGarbage();
}

export type RetentionProfile = {
  newKeysMb: number;
  repeatedKeysMb: number;
  moreNewKeysMb: number;
};

/**
 * Three passes over a cache, designed so heap noise cancels out.
 *
 * `repeatedKeysMb` near zero means growth tracks distinct keys rather than call
 * volume. `moreNewKeysMb` staying close to `newKeysMb`, instead of reusing the
 * space the first pass took, means nothing was ever released.
 *
 * Assert on `moreNewKeysMb` when testing that a cache retains nothing.
 * `newKeysMb` also carries the one-off heap growth of first touching an
 * allocation of this size, which a warm-up does not fully absorb, so it reads
 * as a megabyte or so even when nothing is retained. By pass 3 the heap floor
 * has settled and the number is retention alone.
 */
export function profileCacheRetention({
  driveNewKeys,
  driveSameKeys,
  driveMoreNewKeys,
}: {
  driveNewKeys: () => void;
  driveSameKeys: () => void;
  driveMoreNewKeys: () => void;
}): RetentionProfile {
  return {
    newKeysMb: measureRetainedMb(driveNewKeys),
    repeatedKeysMb: measureRetainedMb(driveSameKeys),
    moreNewKeysMb: measureRetainedMb(driveMoreNewKeys),
  };
}

export function formatRetentionProfile(
  profile: RetentionProfile,
  { entryCount, entryLabel }: { entryCount: number; entryLabel: string },
): string {
  const { newKeysMb, repeatedKeysMb, moreNewKeysMb } = profile;
  const bytesPerEntry = (newKeysMb * 1024 * 1024) / entryCount;
  const totalMb = newKeysMb + repeatedKeysMb + moreNewKeysMb;

  // A pass can measure slightly negative when it releases more than it takes.
  const signed = (mb: number) =>
    `${mb < 0 ? "-" : "+"}${Math.abs(mb).toFixed(1)}`;

  return `
  gc exposed:  ${canForceGarbageCollection}
  batch:       ${entryCount.toLocaleString()} ${entryLabel}

  pass 1  new keys         ${signed(newKeysMb)} MB
  pass 2  same keys again  ${signed(repeatedKeysMb)} MB
  pass 3  new keys         ${signed(moreNewKeysMb)} MB

  retained per entry (pass 1):  ${bytesPerEntry.toFixed(0)} B
  total held after 3 passes:    ${signed(totalMb)} MB
`;
}
