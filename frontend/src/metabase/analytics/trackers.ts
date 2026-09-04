/**
 * Every tracker implementation, behind one module.
 *
 * `metabase/analytics` imports this with `import()`, so the trackers and the
 * vendor code they pull in stay out of the entry chunk.
 */
export { createSnowplowTracker } from "./snowplow";
export { trackPageView } from "./page-view";
export { trackSchemaEvent, trackSimpleEvent } from "./event";
export { initMetaplow } from "metabase/utils/metaplow";
