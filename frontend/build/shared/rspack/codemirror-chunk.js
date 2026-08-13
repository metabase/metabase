/* eslint-env node */

/**
 * Every code editor sits behind its own `import()`, so each of those chunks
 * would otherwise carry its own copy of CodeMirror. This collects the library
 * into one async chunk that they all share.
 *
 * `chunks: "async"` keeps it out of the initial payload, and overrides the
 * enclosing `splitChunks.chunks` predicate, which the SDK build narrows to its
 * own chunked entry.
 *
 * Kept off `w3c-keyname`, which prosemirror also uses, so the document chunks
 * do not end up depending on this one.
 *
 * Both the app build and the embedding SDK build need this. When only the app
 * build had it, the SDK duplicated CodeMirror across six async chunks.
 */
/**
 * `chunks` is pinned to the literal so it survives into `rspack.main.config.js`,
 * which is `@ts-check`ed and rejects a widened `string`.
 *
 * @type {{
 *   test: RegExp,
 *   chunks: "async",
 *   name: string,
 *   priority: number,
 *   reuseExistingChunk: boolean,
 * }}
 */
const CODEMIRROR_CACHE_GROUP = {
  test: /[\\/](@codemirror|@lezer|@uiw|@xiechao|style-mod|crelt)[\\/]/,
  chunks: "async",
  name: "codemirror",
  priority: 20,
  reuseExistingChunk: true,
};

module.exports = { CODEMIRROR_CACHE_GROUP };
