/**
 * The imports here are only called from the Embedding SDK.
 * This file is not imported from the main app, including the new iframe embedding.
 *
 * This is aliased as `sdk-specific-imports` in the SDK's webpack config.
 */

// Polyfills useSyncExternalStore for React 17 for backwards compatibility.
import "./polyfill/use-sync-external-store";

/**
 * NOTE: heavy dependencies that are lazily imported in the main codebase
 * (`jspdf`, `html2canvas-pro` for PDF / image export; `react-virtualized` via
 * the pivot table grid) are intentionally NOT eagerly imported here. They are
 * loaded on demand via dynamic `import()`, so they no longer weigh down the
 * SDK's critical-path bundle. On-demand chunks resolve against the runtime
 * `publicPath` set in `./sdk-public-path`.
 */
/**
 * The map renderer (and leaflet) is lazily chunk-split in the main app, but the
 * SDK bundle can't fetch on-demand chunks at runtime. Importing it eagerly here
 * pulls it into the preloaded SDK bundle so the `import()` in `Map.tsx` resolves
 * from an already-loaded chunk instead of 404ing.
 */
import "metabase/visualizations/visualizations/Map/MapRenderer";
