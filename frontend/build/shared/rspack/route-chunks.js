/* eslint-env node */
const fs = require("fs");
const path = require("path");

const { readRoutes } = require("./routes");

const GENERATED = path.join(__dirname, "route-chunks.json");

/**
 * Routes found by building the tree, written by `route-preloads.unit.spec.ts`.
 *
 * A plugin registers its routes at runtime, so source cannot reach them and the
 * reader reports nothing for those subtrees. Building the tree reaches them, but
 * needs a module environment a production build does not have, so the result is
 * generated and committed. It holds chunk names and no hashes, which is what
 * makes it stable between builds.
 */
function executedRouteChunks() {
  return JSON.parse(fs.readFileSync(GENERATED, "utf8"));
}

const keyOf = ({ pattern, chunks }) =>
  `${pattern} -> ${[...chunks].sort().join("+")}`;

/**
 * Every route the manifest should carry: what source reports, plus what only
 * building the tree finds.
 *
 * A pattern can carry different chunks in different instances, because a plugin
 * picks between an upsell page and the real one. The two are united rather than
 * one winning, since a hint nobody uses costs a download and a missing hint
 * costs a page.
 */
function allRouteChunks(root) {
  const byPattern = new Map();

  for (const route of [...readRoutes(root).routes, ...executedRouteChunks()]) {
    if (route.chunks.length === 0) {
      continue;
    }
    const united = new Set([...(byPattern.get(route.pattern) ?? []), ...route.chunks]);
    byPattern.set(route.pattern, united);
  }

  return [...byPattern].map(([pattern, chunks]) => ({
    pattern,
    chunks: [...chunks].sort(),
  }));
}

module.exports = { allRouteChunks, executedRouteChunks, keyOf, GENERATED };
