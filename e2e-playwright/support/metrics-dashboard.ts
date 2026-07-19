/**
 * Helpers unique to the metrics-dashboard port.
 *
 * Everything else this spec needs already lives in shared modules
 * (createDashboardWithQuestions in factories.ts; the visualizer surface in
 * visualizer-basics.ts; dashboard editing in dashboard.ts; MetricPage /
 * visitMetric / cartesianChartCircles in metrics.ts; chartLegend in
 * visualizer-cartesian.ts) — import those read-only.
 */
import type { Locator, Page } from "@playwright/test";

import { chartLegend } from "./visualizer-cartesian";

/**
 * Port of H.chartLegendItem(name) (e2e-dashboard-visualizer-helpers.ts):
 * chartLegend().findByText(name). testing-library findByText with a string is
 * an exact match → { exact: true }. `scope` mirrors the Cypress calls, which
 * ran the bare helper both at page scope and inside `.within()` blocks.
 */
export function chartLegendItem(
  scope: Page | Locator,
  name: string,
): Locator {
  return chartLegend(scope).getByText(name, { exact: true });
}
