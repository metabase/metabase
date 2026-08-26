// Stands in for `cljs/metabase.util.currency` where the compiled cljs output
// is unavailable (the timezone CI job skips the cljs build). Import-time only;
// suites using it must not format currency values.
module.exports = {
  currency: [],
  currency_symbol: {},
};
