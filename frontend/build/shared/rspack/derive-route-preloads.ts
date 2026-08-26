import type { RouteObject } from "react-router";

import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";

/**
 * A route's chunk, read out of the `webpackChunkName` comment that survives
 * into the loader's source. Nothing else records which chunk serves a route, so
 * this is the only place the two can be matched up without a table by hand.
 */
function chunkOf(loader: unknown): string | null {
  if (typeof loader !== "function") {
    return null;
  }
  return String(loader).match(/webpackChunkName:\s*"([^"]+)"/)?.[1] ?? null;
}

/**
 * A modal opens after its page has rendered, so it is never worth preloading.
 * `lazyModalRoute` hangs the modal's own loader off the wrapper it builds, which
 * is what makes one recognisable here.
 */
function isModal(loader: unknown): boolean {
  return typeof loader === "function" && "loadModal" in loader;
}

/**
 * A route slot no plugin filled in. In OSS, and in a test that does not
 * initialise the enterprise plugins, these hold the placeholder rather than a
 * loader, so there is no chunk to find and none to complain about.
 */
function isUnfilledPluginSlot(loader: unknown): boolean {
  return loader === pluginPlaceholderRoute;
}

export type RouteChunk = { pattern: string; chunks: string[] };
export type Unnamed = { pattern: string };

function joinPath(prefix: string, path: string): string {
  const joined = path.startsWith("/")
    ? path
    : [prefix, path].filter(Boolean).join("/");
  const absolute = joined.startsWith("/") ? joined : `/${joined}`;
  return absolute.replace(/\/{2,}/g, "/");
}

/**
 * Every route that loads its page on demand, with the chunks it needs, found by
 * building the real tree.
 *
 * The build does this by reading source instead, in `route-preloads/derive.js`,
 * because importing the app needs the asset loaders and the ClojureScript build.
 * This is the check on that: `route-preloads.unit.spec.ts` fails when reading
 * source misses a route building the tree finds.
 *
 * `unnamed` collects the routes whose loader names no chunk and is not a modal.
 * Those pages land in a numbered chunk that nothing can preload or recognise in
 * a bundle report, so the caller fails on them rather than dropping them.
 */
export function collectRouteChunks(routes: RouteObject[]): {
  routes: RouteChunk[];
  unnamed: Unnamed[];
} {
  const collected: RouteChunk[] = [];
  const unnamed: Unnamed[] = [];

  const walk = (nodes: RouteObject[], prefix: string, inherited: string[]) => {
    for (const node of nodes) {
      const pattern = joinPath(prefix, node.path ?? "");
      const chunk = chunkOf(node.lazy);
      let chunks = inherited;

      if (chunk) {
        chunks = [...new Set([...inherited, chunk])];
        collected.push({ pattern, chunks });
      } else if (
        node.lazy &&
        !isModal(node.lazy) &&
        !isUnfilledPluginSlot(node.lazy)
      ) {
        unnamed.push({ pattern });
      }

      walk(node.children ?? [], pattern === "/" ? "" : pattern, chunks);
    }
  };

  walk(routes, "", []);
  return { routes: collected, unnamed };
}
