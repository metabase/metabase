/**
 * Custom Jest transform that exports file contents as a raw string.
 * Used for Vite's `?raw` import suffix — files matched by this transform
 * are turned into `module.exports = "<file contents>"`.
 */
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
