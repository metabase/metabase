import type { RouteObject } from "react-router";

export type PreloadRow = { patterns: string[]; chunks: string[] };

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
 * Every route that loads its page on demand, with the chunks it needs: its own,
 * plus those of the lazy routes it renders inside.
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
      } else if (node.lazy && !isModal(node.lazy)) {
        unnamed.push({ pattern });
      }

      walk(node.children ?? [], pattern === "/" ? "" : pattern, chunks);
    }
  };

  walk(routes, "", []);
  return { routes: collected, unnamed };
}

const segmentsOf = (pattern: string) => pattern.split("/").filter(Boolean);
const keyOf = (chunks: string[]) => [...chunks].sort().join("+");

type TrieNode = {
  pattern: string;
  chunks?: string[];
  children: Map<string, TrieNode>;
};

function buildTrie(routes: RouteChunk[]): TrieNode {
  const root: TrieNode = { pattern: "", children: new Map() };

  for (const route of routes) {
    let node = root;
    let pattern = "";
    for (const segment of segmentsOf(route.pattern)) {
      pattern += `/${segment}`;
      let child = node.children.get(segment);
      if (!child) {
        child = { pattern, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.chunks = route.chunks;
  }

  return root;
}

function chunkSetsBelow(node: TrieNode, found = new Set<string>()) {
  if (node.chunks) {
    found.add(keyOf(node.chunks));
  }
  for (const child of node.children.values()) {
    chunkSetsBelow(child, found);
  }
  return found;
}

function anyChunksBelow(node: TrieNode): string[] {
  if (node.chunks) {
    return node.chunks;
  }
  for (const child of node.children.values()) {
    const found = anyChunksBelow(child);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

/** The chunks a node stands for, when everything below it agrees on one set. */
function claimOf(node: TrieNode): string[] | null {
  if (node.chunks) {
    return node.chunks;
  }
  const distinct = chunkSetsBelow(node);
  return distinct.size === 1 ? anyChunksBelow(node) : null;
}

/**
 * One row per place the chunks change, rather than one row per route.
 *
 * The backend takes the first row that matches, and rows are sorted deepest
 * first, so `/question/ask` shields `/question/*` and a section needs a row only
 * where it stops agreeing with the section it sits in. That turns ~180 routes
 * into a table small enough to read.
 */
export function coalesce(routes: RouteChunk[]): PreloadRow[] {
  const rows: PreloadRow[] = [];
  const root = buildTrie(routes);

  const emit = (node: TrieNode, covered: string | null) => {
    const below = chunkSetsBelow(node);
    if (below.size === 0) {
      return;
    }

    let nowCovered = covered;
    const claim = node.pattern === "" ? null : claimOf(node);

    if (claim && keyOf(claim) !== covered) {
      rows.push({
        patterns:
          node.children.size > 0
            ? [node.pattern, `${node.pattern}/*`]
            : [node.pattern],
        chunks: claim,
      });
      nowCovered = keyOf(claim);
      if (below.size === 1) {
        return;
      }
    }

    for (const child of node.children.values()) {
      emit(child, nowCovered);
    }
  };

  emit(root, null);

  const rootRoute = routes.find((route) => route.pattern === "/");
  if (rootRoute) {
    rows.push({ patterns: ["/"], chunks: rootRoute.chunks });
  }

  return sortBySpecificity(rows);
}

/**
 * Deepest first, then literal patterns before ones with a parameter or a
 * wildcard, so the order the backend walks is deterministic and a narrower row
 * always precedes the wider row it sits inside.
 */
function sortBySpecificity(rows: PreloadRow[]): PreloadRow[] {
  const rank = (pattern: string) =>
    pattern.includes("*") ? 2 : pattern.includes(":") ? 1 : 0;

  return [...rows].sort((a, b) => {
    const [first] = a.patterns;
    const [second] = b.patterns;
    return (
      segmentsOf(second).length - segmentsOf(first).length ||
      rank(first) - rank(second) ||
      first.localeCompare(second)
    );
  });
}

export function deriveRoutePreloads(routes: RouteObject[]) {
  const { routes: collected, unnamed } = collectRouteChunks(routes);
  return { rows: coalesce(collected), unnamed };
}
