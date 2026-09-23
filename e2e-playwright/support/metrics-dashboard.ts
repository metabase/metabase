/**
 * Helpers unique to the metrics-dashboard port.
 *
 * Everything else this spec needs already lives in shared modules
 * (createDashboardWithQuestions in factories.ts; the visualizer surface in
 * visualizer-basics.ts; dashboard editing in dashboard.ts; MetricPage /
 * visitMetric / cartesianChartCircles in metrics.ts; chartLegend in
 * visualizer-cartesian.ts) — import those read-only.
 */
// chartLegendItem is now canonical in ./visualizer-basics; re-exported so this
// module's consumers keep their import unchanged.
export { chartLegendItem } from "./visualizer-basics";
