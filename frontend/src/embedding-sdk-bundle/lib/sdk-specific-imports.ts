/**
 * The imports here are only called from the Embedding SDK.
 * This file is not imported from the main app, including the new iframe embedding.
 *
 * This is aliased as `sdk-specific-imports` in the SDK's webpack config.
 */

// Polyfills useSyncExternalStore for React 17 for backwards compatibility.
import "./polyfill/use-sync-external-store";

/**
 * NOTE: heavy, export-only dependencies (`jspdf`, `html2canvas-pro`) are
 * intentionally NOT eagerly imported here. They are loaded on demand via
 * dynamic `import()` from the main codebase (PDF / image export), so they no
 * longer weigh down the SDK's critical-path bundle. On-demand chunks resolve
 * against the runtime `publicPath` set in `./sdk-public-path`.
 */
/**
 * The map renderer (and leaflet) is lazily chunk-split in the main app, but the
 * SDK bundle can't fetch on-demand chunks at runtime. Importing it eagerly here
 * pulls it into the preloaded SDK bundle so the `import()` in `Map.tsx` resolves
 * from an already-loaded chunk instead of 404ing.
 */
import "metabase/visualizations/visualizations/Map/MapRenderer";

// react-virtualized powers the pivot table grid and is lazily imported in the
// main app. The SDK bundle can't fetch on-demand chunks at runtime, so force the
// pivot table module to be included eagerly here.
import "metabase/visualizations/visualizations/PivotTable/PivotTableInner";
