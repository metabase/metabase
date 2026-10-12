import type { RouteObject } from "react-router";

/**
 * A route whose page follows a premium feature carries both branches as
 * properties (see `featureGatedRoute`), which is what lets this find the chunks
 * of pages the running configuration would never pick.
 */
type GatedLoader = {
  enabled: unknown;
  disabled: unknown;
};

function isGated(loader: unknown): loader is GatedLoader {
  return typeof loader === "function" && "gatedOn" in loader;
}

/**
 * A route's chunks, read out of the `webpackChunkName` comments that survive
 * into the loader's source. Nothing else records which chunk serves a route, so
 * this is the only place the two can be matched up without a table by hand.
 */
function chunksOf(loader: unknown): string[] {
  if (typeof loader !== "function") {
    return [];
  }
  if (isGated(loader)) {
    return [
      ...new Set([...chunksOf(loader.enabled), ...chunksOf(loader.disabled)]),
    ];
  }
  const chunk = String(loader).match(/webpackChunkName:\s*"([^"]+)"/)?.[1];
  return chunk ? [chunk] : [];
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
 * A loader that fetches nothing: the page it resolves ships in a bundle already
 * on the page, such as `outletRoute` or an eagerly imported plugin page. There
 * is no chunk to find and none to complain about.
 */
function loadsNoChunk(loader: unknown): boolean {
  if (typeof loader !== "function") {
    return true;
  }
  if (isGated(loader)) {
    return loadsNoChunk(loader.enabled) && loadsNoChunk(loader.disabled);
  }
  // `import()` in source; jest's transform turns it into a `require` call.
  return !/\bimport\(|\brequire\(/.test(String(loader));
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
 * The build does this by reading source instead, in `routes/`, because
 * importing the app needs the asset loaders and the ClojureScript build. This
 * is the check on that: `route-preloads.unit.spec.ts` fails when the two
 * disagree on any route.
 *
 * `unnamed` collects the routes whose loader fetches a chunk nothing names.
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
      const found = chunksOf(node.lazy);
      let chunks = inherited;

      if (found.length > 0) {
        chunks = [...new Set([...inherited, ...found])];
        collected.push({ pattern, chunks });
      } else if (node.lazy && !isModal(node.lazy) && !loadsNoChunk(node.lazy)) {
        unnamed.push({ pattern });
      }

      walk(node.children ?? [], pattern === "/" ? "" : pattern, chunks);
    }
  };

  walk(routes, "", []);
  return { routes: collected, unnamed };
}
