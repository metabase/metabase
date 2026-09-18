import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

import { redirect, reload } from "metabase/utils/dom";
import { retry } from "metabase/utils/retry";

import { getPendingBlockerArgs, getPendingNavigationHref } from "./navigator";
import { hasUnsavedChanges } from "./route-leave-guards";

/**
 * Rendered in place of a page whose chunk never arrived. Supplied by the app
 * rather than imported: the error pages live above this module's tier, the same
 * reason `hydrateFallback` is passed in to `createAppRouter`.
 */
export type ChunkErrorFallback = ComponentType<{
  hasUnsavedChanges: boolean;
}>;

type LazyRouteFn = Extract<
  NonNullable<RouteObject["lazy"]>,
  (...args: never[]) => unknown
>;

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

const Blank = () => null;

/**
 * Recover from a page whose chunk could not be loaded.
 *
 * The deploy that produced this page's HTML is gone, or is one of several still
 * being served, so the hashed chunk it asks for is missing. A full page load
 * fixes it, because the HTML comes back naming chunks that exist.
 *
 * Resolving with a component rather than rejecting is what keeps that safe.
 * A rejected `lazy` completes the navigation with an error and renders the
 * nearest `errorElement`, unmounting whatever that boundary covers. Resolving
 * puts the fallback in the route's own slot instead, so the page the user is on
 * is never touched. The fallback draws itself over that page, and dismissing it
 * returns to it.
 *
 * So the page is only replaced when there is nothing to lose. The leave guards
 * answer for a navigation that leaves the page, but they exempt one that stays
 * within it, and those navigate to their own chunks too.
 */
function recoverFromChunkError(Fallback: ChunkErrorFallback) {
  const args = getPendingBlockerArgs();
  const isDirty = hasUnsavedChanges(args);

  if (!isDirty && canReloadNow()) {
    const href = getPendingNavigationHref();
    // No pending navigation means this is the first load of the page itself,
    // where the current URL is already the destination.
    if (href) {
      redirect(href);
    } else {
      reload();
    }
    return { Component: Blank };
  }

  return {
    Component: function ChunkErrorRoute() {
      return <Fallback hasUnsavedChanges={isDirty} />;
    },
  };
}

function guardLazyRoute(load: LazyRouteFn, Fallback: ChunkErrorFallback) {
  return async (...args: Parameters<LazyRouteFn>) => {
    try {
      return await retry(() => load(...args), {
        maxRetries: MAX_RETRIES,
        shouldRetry: isChunkLoadError,
        // Jittered, so that every tab that a deploy breaks at once does not ask
        // again in step.
        delayMs: () => RETRY_DELAY_MS + Math.random() * RETRY_JITTER_MS,
      });
    } catch (error) {
      if (!isChunkLoadError(error)) {
        throw error;
      }
      return recoverFromChunkError(Fallback);
    }
  };
}

/**
 * Wraps every `lazy` in the tree so a missing chunk recovers instead of
 * rendering nothing.
 *
 * Applied to the assembled tree rather than at each `lazy:` site, so a route
 * added later is covered without anyone remembering to. It also has to be the
 * route object that is wrapped and not the loader function: `registerPagePrefetch`
 * holds the same functions, and a hover must not be able to load the page.
 */
export function withChunkErrorRecovery(
  routes: RouteObject[],
  Fallback: ChunkErrorFallback | undefined,
): RouteObject[] {
  if (!Fallback) {
    return routes;
  }
  return routes.map((route): RouteObject => {
    // react-router also accepts an object `lazy`, which splits a route by
    // property rather than by module. Nothing here uses that form, and it has no
    // single module to recover.
    const { lazy } = route;
    const recovering =
      typeof lazy === "function"
        ? { lazy: guardLazyRoute(lazy, Fallback) }
        : null;

    // An index route carries no children, and the two shapes are only
    // assignable to `RouteObject` when they are built apart.
    if (route.index) {
      return { ...route, ...recovering };
    }
    return {
      ...route,
      ...recovering,
      ...(route.children && {
        children: withChunkErrorRecovery(route.children, Fallback),
      }),
    };
  });
}
