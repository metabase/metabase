import type { ComponentType } from "react";

import { redirect, reload } from "metabase/utils/dom";
import { delay } from "metabase/utils/promise";
import { retry } from "metabase/utils/retry";

import { getPendingNavigationHref } from "./navigator";
import { hasUnsavedChanges } from "./route-leave-guards";

/**
 * Rendered in place of a page whose chunk never arrived. Supplied by the app
 * rather than imported: the error pages live above this module's tier, the same
 * reason `hydrateFallback` is passed in to `createAppRouter`.
 */
export type ChunkErrorFallback = ComponentType<{
  hasUnsavedChanges: boolean;
}>;

/**
 * What to put in the slot of a page whose chunk never arrived.
 *
 * `after` is a full page load already on its way. Nothing renders until it
 * resolves, and it only resolves while this document is still here, which means
 * the load was cancelled.
 */
export type ChunkRecovery = {
  Component: ComponentType;
  after?: Promise<void>;
};

/**
 * The policy a code-split page follows when its chunk does not arrive: how long
 * to keep asking, and what to do once asking is done.
 *
 * Handed to the caching layer rather than wrapped around the loader, so one
 * walk of the route tree covers both and a page that recovered is not cached as
 * a page that loaded.
 */
export type ChunkErrorRecovery = {
  retry: <T>(load: () => Promise<T>) => Promise<T>;
  /** `null` for a failure that is not a missing chunk, which the app reports. */
  recover: (error: unknown) => ChunkRecovery | null;
};

// A chunk is one request against one instance, so a retry is a fresh pick from
// whatever is behind the load balancer. During a rolling deploy a pick lands on
// a instance that still serves this build about as often as that build is still
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

// A full page load only fixes this when it lands on a build that has the chunk.
// Mid-rollout it can land on the same instance again, so the recovery is capped
// rather than counted: a stamp, not a flag, so a genuine second deploy later in
// the same tab still recovers.
const RELOAD_INTERVAL_MS = 10_000;
const RELOAD_STAMP_KEY = "metabase-chunk-reload-at";

// How long a full page load gets before this document is treated as staying.
// The browser acts on the load at once, so a document that is still here after
// this was kept: an unload prompt answered with Stay, or a navigation the
// browser refused.
const RELOAD_GRACE_MS = 2000;

const CHUNK_ERROR_PATTERN =
  /loading chunk|loading css chunk|failed to fetch dynamically imported module|error loading dynamically imported module/i;

/**
 * Whether the module failed to arrive, rather than failing once it did.
 *
 * Only a missing chunk is worth recovering from by loading the page again. A
 * module whose own top-level code throws would throw again just as reliably, and
 * reloading for it is an endless loop.
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
 * Whether the browser says it has no network at all.
 *
 * A chunk that cannot be fetched because the connection is gone looks exactly
 * like one a deploy removed. Loading the page again fixes the second and
 * replaces a working app with the browser's offline page for the first, so the
 * error is shown over the page instead and the app stays up.
 */
function isOffline(): boolean {
  return navigator.onLine === false;
}

function canReloadNow(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY));
    if (Number.isFinite(last) && Date.now() - last < RELOAD_INTERVAL_MS) {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
    return true;
  } catch {
    // Storage can throw outright where site data is blocked. Without somewhere
    // to record the attempt there is no way to stop a loop, so don't start one.
    return false;
  }
}

/**
 * Recover from a page whose chunk could not be loaded.
 *
 * The deploy that produced this page's HTML is gone, or is one of several still
 * being served, so the hashed chunk it asks for is missing. A full page load
 * fixes it, because the HTML comes back naming chunks that exist.
 *
 * The page is only replaced when there is nothing to lose. The leave guards
 * answer for what they hold rather than for where this navigation is going, so
 * a page that keeps unsaved work through an in-page navigation still counts as
 * dirty, and a page whose guard has already agreed to be left does not.
 *
 * Everything else keeps the current page and draws the error over it. That is
 * what resolving a component rather than rejecting buys: a rejected `lazy`
 * completes the navigation with an error and renders the nearest
 * `errorElement`, unmounting whatever that boundary covers.
 */
function recoverFromChunkError(Fallback: ChunkErrorFallback): ChunkRecovery {
  const isDirty = hasUnsavedChanges();
  const Component = function ChunkErrorPage() {
    return <Fallback hasUnsavedChanges={isDirty} />;
  };

  // `canReloadNow` records the attempt, so it is asked last: a page load that
  // is not going to happen must not spend the one that is allowed.
  if (isDirty || isOffline() || !canReloadNow()) {
    return { Component };
  }

  const href = getPendingNavigationHref();
  // No pending navigation means the destination is already the current URL,
  // either because this is the first load of the page or because the router
  // committed the location without waiting for the chunk.
  if (href) {
    redirect(href);
  } else {
    reload();
  }

  return { Component, after: delay(RELOAD_GRACE_MS) };
}

/**
 * How a code-split page recovers from a chunk that never arrives.
 *
 * `Fallback` is supplied by the app rather than imported: the error pages live
 * above this module's tier, the same reason `hydrateFallback` is passed in to
 * `createAppRouter`.
 */
export function chunkErrorRecovery(
  Fallback: ChunkErrorFallback,
): ChunkErrorRecovery {
  return {
    retry: (load) =>
      retry(load, {
        maxRetries: MAX_RETRIES,
        shouldRetry: isWorthRetrying,
        // Jittered, so that every tab that a deploy breaks at once does not ask
        // again in step.
        delayMs: () => RETRY_DELAY_MS + Math.random() * RETRY_JITTER_MS,
      }),
    recover: (error) =>
      isChunkLoadError(error) ? recoverFromChunkError(Fallback) : null,
  };
}
