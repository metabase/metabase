import { type ComponentType, type ReactNode, Suspense } from "react";
import {
  type BaseRouteObject,
  type LazyRouteFunction,
  Outlet,
  type RouteObject,
} from "react-router";

import { isProduction } from "metabase/env";

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

type LazyPage = {
  Component: ComponentType;
  load: () => Promise<unknown>;
};

const pages = new WeakMap<LazyFunction, LazyPage>();

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
  fallback?: ReactNode,
): RouteObject[] {
  return routes.map((route) => {
    const lazy =
      typeof route.lazy === "function"
        ? timeBoxed(route.lazy, fallback)
        : route.lazy;

    return route.index
      ? { ...route, lazy }
      : {
          ...route,
          lazy,
          children:
            route.children && withChunkFallback(route.children, fallback),
        };
  });
}

function timeBoxed(load: LazyFunction, fallback?: ReactNode): LazyFunction {
  const { Component, load: start } = pageFor(load, fallback);
  return () => waitForChunk(start()).then(() => ({ Component }));
}

/**
 * One wrapper per loader, so routes that share a chunk still share a component.
 * A dozen routes mount the query builder, and moving between two of them must
 * not remount it.
 */
function pageFor(load: LazyFunction, fallback?: ReactNode): LazyPage {
  const cached = pages.get(load);
  if (cached) {
    return cached;
  }

  let loading: Promise<unknown> | null = null;
  let failure: unknown = null;
  let Loaded: ComponentType | null = null;

  const start = () =>
    (loading ??= load().then(
      (route) => {
        warnOnDroppedProperties(route);
        Loaded = route.Component ?? Outlet;
      },
      (error) => {
        failure = error;
        throw error;
      },
    ));

  /**
   * The chunk's component, suspending for as long as the module is on its way.
   *
   * `Loaded` is set one step before the step that commits the location, so a
   * chunk that arrives before the wait runs out renders without suspending:
   * nothing waits, and the fallback never mounts.
   *
   * A chunk that failed keeps failing, for every route that shares it, until
   * the page is reloaded. react-router caches a rejected `lazy` per route, so
   * this is wider, but a chunk fails by its URL and every route in it asks for
   * the same one. Dropping the failure to let a later mount try again is what
   * cannot be done: React re-renders a component that throws, which would make
   * the retry a fetch loop.
   */
  function Chunk() {
    if (failure) {
      throw failure;
    }

    if (!Loaded) {
      throw start();
    }

    return <Loaded />;
  }

  function LazyPage() {
    return (
      <Suspense fallback={fallback}>
        <Chunk />
      </Suspense>
    );
  }

  const page = { Component: LazyPage, load: start };
  pages.set(load, page);
  return page;
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
 */
function waitForChunk(loading: Promise<unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, CHUNK_WAIT_MS);
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
