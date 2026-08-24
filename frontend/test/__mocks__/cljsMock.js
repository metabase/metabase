// Inert stand-in for compiled cljs modules (cljs/*) in the timezone jest config,
// which runs without building the cljs bundle. Named imports not listed here
// resolve to undefined at import time (CJS interop), so unused modules stay
// harmless; a tz spec that actually exercises cljs behavior needs the real
// bundle instead.
module.exports = {
  currency: [],
  TYPE: {},
  LEVEL_ONE_TYPES: [],
  isa: () => false,
};
