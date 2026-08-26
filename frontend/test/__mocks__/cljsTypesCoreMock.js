// Stands in for `cljs/metabase.types.core` where the compiled cljs output is
// unavailable (the timezone CI job skips the cljs build). Type keys resolve to
// their own names; suites using it must not rely on real type semantics.
module.exports = {
  isa: () => false,
  TYPE: new Proxy({}, { get: (_target, prop) => String(prop) }),
  LEVEL_ONE_TYPES: [],
  is_coerceable: () => false,
  coercions_for_type: () => [],
};
