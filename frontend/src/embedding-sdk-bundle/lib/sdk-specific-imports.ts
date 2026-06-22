/**
 * The imports here are only called from the Embedding SDK.
 * This file is not imported from the main app, including the new iframe embedding.
 *
 * This is aliased as `sdk-specific-imports` in the SDK's webpack config.
 */

// Polyfills useSyncExternalStore for React 17 for backwards compatibility.
import "./polyfill/use-sync-external-store";

/**
 * We need to manually import them here to make sure they are included in the bundle
 * as they're dynamically loaded in the main codebase.
 *
 * This will crash the main app if it's included in the new iframe embedding plugin,
 * as we chunk-split these two dependencies to make it only dynamically loadable.
 */
import "html2canvas-pro";
import "jspdf";

// react-virtualized powers the pivot table grid and is lazily imported in the
// main app. The SDK bundle can't fetch on-demand chunks at runtime, so force the
// pivot table module to be included eagerly here.
import "metabase/visualizations/visualizations/PivotTable/PivotTableInner";
