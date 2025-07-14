if (
  // eslint-disable-next-line no-undef
  process.env.ENABLE_CLJS_HOT_RELOAD === "true" ||
  // eslint-disable-next-line no-undef
  process.env.NODE_ENV === "development"
) {
  import("cljs/metabase.util.devtools");
}
