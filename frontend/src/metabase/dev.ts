if (
  process.env.ENABLE_CLJS_HOT_RELOAD === "true" ||
  process.env.ENABLE_CLJS_DEV_TOOLS === "true"
) {
  import("cljs/metabase.util.devtools");
}
