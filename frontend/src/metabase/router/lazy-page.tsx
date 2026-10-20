import { type ComponentType, type ReactNode, Suspense, lazy } from "react";
import {
  type BaseRouteObject,
  type LazyRouteFunction,
  Outlet,
  type RouteObject,
} from "react-router";

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
 * those before it commits, and this commits first.
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

  let loading: ReturnType<LazyFunction> | null = null;
  const start = () => (loading ??= load());

  const Chunk = lazy(() =>
    // A route that resolves no component renders its children, which is what
    // react-router does for a route that has none.
    start().then(({ Component }) => ({ default: Component ?? Outlet })),
  );

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
