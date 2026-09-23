import { LegendComponent } from "echarts/components";
import { use } from "echarts/core";

/**
 * The shared registerEChartsModules() registers everything the app's
 * visualizations need, but not the legend — Metabase renders its own legends.
 * The embedding map relies on the built-in ECharts legend, so register it here.
 */
export function registerLegendComponent() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  use([LegendComponent]);
}
