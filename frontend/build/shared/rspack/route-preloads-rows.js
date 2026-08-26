/* eslint-env node */

/**
 * Turning the route tree into preload rows.
 *
 * One row per place the chunks change, rather than one row per route.
 *
 * The backend takes the first row that matches, and rows are sorted deepest
 * first, so `/question/ask` shields `/question/*` and a section earns a row only
 * where it stops agreeing with the section it sits in. That turns roughly two
 * hundred routes into a table small enough to read.
 */

const segmentsOf = (pattern) => pattern.split("/").filter(Boolean);
const keyOf = (chunks) => [...chunks].sort().join("+");

function buildTrie(routes) {
  const root = { pattern: "", children: new Map() };

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

function chunkSetsBelow(node, found = new Set()) {
  if (node.chunks) {
    found.add(keyOf(node.chunks));
  }
  for (const child of node.children.values()) {
    chunkSetsBelow(child, found);
  }
  return found;
}

function anyChunksBelow(node) {
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
function claimOf(node) {
  if (node.chunks) {
    return node.chunks;
  }
  const distinct = chunkSetsBelow(node);
  return distinct.size === 1 ? anyChunksBelow(node) : null;
}

/**
 * Deepest first, then literal patterns before ones with a parameter or a
 * wildcard, so the order the backend walks is deterministic and a narrower row
 * always precedes the wider row it sits inside.
 */
function sortBySpecificity(rows) {
  const rank = (pattern) =>
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

function coalesce(routes) {
  const rows = [];
  const root = buildTrie(routes);

  const emit = (node, covered) => {
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
 * Rows for the routes that load their page on demand. A route with no chunk of
 * its own still inherits its parents', which is what a nested page needs.
 */
function preloadRows(routes) {
  return coalesce(routes.filter((route) => route.chunks.length > 0));
}

module.exports = { preloadRows };
