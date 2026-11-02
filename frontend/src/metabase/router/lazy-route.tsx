import type { ComponentType } from "react";

import { redirect, reload } from "metabase/utils/dom";
import { isChunkLoadError, retryChunkLoad } from "metabase/utils/lazy-chunk";
import { delay } from "metabase/utils/promise";

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
    retry: retryChunkLoad,
    recover: (error) =>
      isChunkLoadError(error) ? recoverFromChunkError(Fallback) : null,
  };
}
