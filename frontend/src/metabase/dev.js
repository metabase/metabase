if (
  // eslint-disable-next-line no-undef
  process.env.ENABLE_CLJS_HOT_RELOAD === "true" ||
  // eslint-disable-next-line no-undef
  process.env.ENABLE_CLJS_DEV_TOOLS === "true"
) {
  import("cljs/metabase.util.devtools");
}
