/**
 * Helpers for proving that a cache releases what its callers are done with.
 *
 * Specs using these must run under `--expose-gc --runInBand`, otherwise there
 * is no way to force a collection and a WeakRef never clears:
 *
 *   bun run test-memory
 */

// Node attaches `gc` to the global object only under --expose-gc, so it is
// absent from the ambient typings.
const forceGc = (globalThis as { gc?: () => void }).gc;

/**
 * Call this first. Without --expose-gc a retention test silently proves
 * nothing, and a test that cannot measure must fail rather than report a
 * vacuous pass.
 */
export function requireGarbageCollection() {
  if (forceGc == null) {
    throw new Error(
      "This spec proves a value is collected and needs --expose-gc. Run `bun run test-memory`.",
    );
  }
}

/**
 * Lets the frames still holding a just-returned value unwind, so a WeakRef to
 * it can actually be collected. Without this the control arm of a retention
 * test survives too and the test discriminates nothing.
 */
export async function settleAndCollect(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  forceGc?.();
  forceGc?.();
}
