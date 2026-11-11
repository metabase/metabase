import { type ComponentType, type ReactNode, Suspense, useEffect } from "react";
import {
  type BaseRouteObject,
  type LazyRouteFunction,
  Outlet,
  type RouteObject,
} from "react-router";

import { isProduction } from "metabase/env";

import type { ChunkErrorRecovery } from "./lazy-route";

/**
 * How long a navigation into a code-split route waits for its chunk before it
 * commits without it.
 *
 * `route.lazy` holds the location until the module resolves. On a fast
 * connection that reads as an instant navigation. On a slow one the click does
 * nothing at all for as long as the fetch takes: the old page stays on screen,
 * the URL does not move, and nothing says the app is working. Past this point
 * the location commits and the page shows a loading fallback until the chunk
 * lands.
 */
export const CHUNK_WAIT_MS = 1000;

type LazyFunction = LazyRouteFunction<BaseRouteObject>;

export type ChunkFallbackOptions = {
  /** Stands in for the page for as long as its chunk is on its way. */
  fallback?: ReactNode;
  /** What to do about a chunk that never arrives. Pages reject without it. */
  recovery?: ChunkErrorRecovery;
};

/**
 * What the page's slot holds. A page that recovered is `unavailable` rather
 * than `ready`: it renders, but opening the route again asks for the chunk.
 */
type PageState =
  | { status: "loading" }
  | { status: "ready"; Component: ComponentType }
  | { status: "unavailable"; Component: ComponentType }
  | { status: "failed"; error: unknown };

const pages = new WeakMap<LazyFunction, LazyFunction>();

/**
 * Caps how long each `lazy` route in the tree blocks a navigation, and renders
 * `fallback` where the page goes for as long as the chunk is still on its way.
 *
 * Every `lazy` in the app resolves to a `Component` and nothing else. A loader
 * or any other route property cannot be deferred this way: the router needs
 * those before it commits, and this commits first. One that resolves anything
 * else says so in the console outside production.
 */
export function withChunkFallback(
  routes: RouteObject[],
  options: ChunkFallbackOptions = {},
): RouteObject[] {
  return routes.map((route) => {
    const lazy =
      typeof route.lazy === "function"
        ? timeBoxedPage(route.lazy, options)
        : route.lazy;

    return route.index
      ? { ...route, lazy }
      : {
          ...route,
          lazy,
          children:
            route.children && withChunkFallback(route.children, options),
        };
  });
}

/**
 * One wrapper per loader, so routes that share a chunk still share a component.
 * A dozen routes mount the query builder, and moving between two of them must
 * not remount it.
 */
function timeBoxedPage(
  load: LazyFunction,
  { fallback, recovery }: ChunkFallbackOptions,
): LazyFunction {
  const cached = pages.get(load);
  if (cached) {
    return cached;
  }

  let attempt: Promise<void> | null = null;
  let state: PageState = { status: "loading" };
  let isReplacingDocument = false;

  async function fetchPage(): Promise<void> {
    try {
      const route = await (recovery ? recovery.retry(load) : load());
      warnOnDroppedProperties(route);
      state = { status: "ready", Component: route.Component ?? Outlet };
    } catch (error) {
      const recovered = recovery?.recover(error);
      if (!recovered) {
        state = { status: "failed", error };
        throw error;
      }

      if (recovered.after) {
        // Hold the location where it is while the document is replaced. The old
        // page stays on screen until it goes, and a same-document `pushState`
        // never races a load that the browser has already started.
        isReplacingDocument = true;
        await recovered.after;
        isReplacingDocument = false;
      }

      state = { status: "unavailable", Component: recovered.Component };
    }
  }

  const start = () => (attempt ??= fetchPage());

  /**
   * The chunk's component, suspending for as long as the module is on its way.
   *
   * `state` is set one step before the step that commits the location, so a
   * chunk that arrives before the wait runs out renders without suspending:
   * nothing waits, and the fallback never mounts.
   *
   * A module that threw once loaded keeps throwing, for every route that shares
   * it, until the page is reloaded. Dropping that one to let a later render try
   * again is what cannot be done: React re-renders a component that throws,
   * which would make the retry a fetch loop. A missing chunk renders instead of
   * throwing, so `Page` can drop it safely.
   */
  function Chunk() {
    if (state.status === "failed") {
      throw state.error;
    }
    if (state.status === "loading") {
      throw start();
    }

    const { Component } = state;
    return <Component />;
  }

  function Page() {
    useEffect(
      () => () => {
        // Leaving a page that could not be downloaded ends its recovery, so
        // opening it again asks for the chunk. Otherwise the error is this
        // route's component for the rest of the session, and the deploy that
        // removed the chunk has usually finished by the next visit. On unmount
        // rather than on mount, so the visit that recovered keeps its error on
        // screen.
        if (state.status === "unavailable") {
          state = { status: "loading" };
          attempt = null;
        }
      },
      [],
    );

    return (
      <Suspense fallback={fallback}>
        <Chunk />
      </Suspense>
    );
  }

  const timeBoxed: LazyFunction = () =>
    waitForChunk(start(), () => isReplacingDocument).then(() => ({
      Component: Page,
    }));

  pages.set(load, timeBoxed);
  return timeBoxed;
}

function warnOnDroppedProperties(route: object): void {
  if (isProduction) {
    return;
  }

  const dropped = Object.keys(route).filter((key) => key !== "Component");
  if (dropped.length > 0) {
    console.warn(
      `A lazy route resolved ${dropped.join(", ")}, which the chunk fallback drops. Only Component survives it.`,
    );
  }
}

/**
 * Resolves when the chunk arrives or when the wait runs out, whichever is
 * first. A chunk that fails still rejects, so the router reports a failed
 * fetch the way it did before there was a wait to run out.
 *
 * The wait runs on while a full page load is on its way: committing a location
 * into a document that is leaving buys nothing, and the page being left is
 * better to look at than a fallback for a page that will never render.
 */
function waitForChunk(
  loading: Promise<unknown>,
  isReplacingDocument: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!isReplacingDocument()) {
        resolve();
      }
    }, CHUNK_WAIT_MS);
    loading.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
