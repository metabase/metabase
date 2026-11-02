import { type ComponentProps, type ComponentType, lazy } from "react";

import { retry } from "metabase/utils/retry";

// A chunk is one request against one instance, so a retry is a fresh pick from
// whatever is behind the load balancer. During a rolling deploy a pick lands on
// an instance that still serves this build about as often as that build is still
// running, so the chance that every attempt misses falls away quickly.
//
// Five attempts inside a second. The alternative is a full page load, which
// costs more than a second on its own and throws away the state of the tab, so
// a second spent avoiding it is cheap. It is also the cost paid for nothing once
// a deploy is finished and no instance has the file, which is the more common
// case, and that caps how long this is worth trying for.
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 150;
const RETRY_JITTER_MS = 100;

const CHUNK_ERROR_PATTERN =
  /loading chunk|loading css chunk|failed to fetch dynamically imported module|error loading dynamically imported module/i;

/**
 * Whether the module failed to arrive, rather than failing once it did.
 *
 * Only a missing chunk is worth recovering from. A module whose own top-level
 * code throws would throw again just as reliably, and belongs with every other
 * error the app reports.
 */
export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(error.message))
  );
}

/**
 * Whether the request ran out of time rather than failing outright.
 *
 * The chunk loading runtime gives up on a request after
 * `output.chunkLoadTimeout`, two minutes by default, and names that failure
 * `timeout`. Every other failure comes back in milliseconds.
 */
function isChunkLoadTimeout(error: unknown): boolean {
  return error instanceof Error && "type" in error && error.type === "timeout";
}

/**
 * Whether asking for the chunk again is worth the wait.
 *
 * A retry is cheap against a request that failed at once, and it is a fresh
 * pick of instance, so it can land on one that still has the file. A request
 * that timed out has already spent two minutes against a connection that is
 * still there, so asking again costs another two before anything changes on
 * screen. Recover from it instead.
 */
function isWorthRetrying(error: unknown): boolean {
  return isChunkLoadError(error) && !isChunkLoadTimeout(error);
}

/**
 * Run a chunk fetch again while it looks momentarily unreachable, and leave any
 * other failure to the caller.
 */
export function retryChunkLoad<T>(load: () => Promise<T>): Promise<T> {
  return retry(load, {
    maxRetries: MAX_RETRIES,
    shouldRetry: isWorthRetrying,
    // Jittered, so that every tab that a deploy breaks at once does not ask
    // again in step.
    delayMs: () => RETRY_DELAY_MS + Math.random() * RETRY_JITTER_MS,
  });
}

const Blank = () => null;

let fallbackComponent: ComponentType = Blank;

/**
 * Supply what a component whose chunk never arrived renders instead.
 *
 * Injected rather than imported: the error components sit well above this
 * module, and an import of them here would put that whole subtree in front of
 * every chunk in the app.
 */
export function setChunkErrorFallback(fallback: ComponentType): void {
  fallbackComponent = fallback;
}

/**
 * `React.lazy` for a component in its own chunk, which keeps the page it is on
 * when that chunk cannot be loaded.
 *
 * The deploy that produced this page's HTML is gone, or is one of several still
 * being served, so the hashed chunk it asks for is missing. The slot shows the
 * fallback and the rest of the page, unsaved work included, carries on.
 *
 * Resolving with the fallback rather than rejecting is what keeps that true.
 * React holds on to a rejected import and throws it again on every later
 * render, so a rejection both unmounts whatever the nearest error boundary
 * covers and can never recover. A module that throws once loaded still
 * rejects: that is a fault to report, not a file to wait for.
 */
// The bound is `React.lazy`'s own: any component, whatever props it takes. The
// props the caller sees come back from `ComponentProps`, so none of this is
// loose at a call site.
export function lazyChunk<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): ComponentType<ComponentProps<T>> {
  return lazy<ComponentType<ComponentProps<T>>>(async () => {
    try {
      return await retryChunkLoad(load);
    } catch (error) {
      if (!isChunkLoadError(error)) {
        throw error;
      }
      // Nothing throws from here on, so this is the only record that the chunk
      // was missing. `captureConsoleErrors` carries it into a bug report.
      console.error(error);
      // Read at load time rather than at registration: these components are
      // built while the modules that hold them are still being evaluated, which
      // is before the app has supplied a fallback.
      const Fallback = fallbackComponent;
      return { default: () => <Fallback /> };
    }
  });
}
