export {
  type RegisteredVisualization,
  canSavePng,
  getDefaultSize,
  getIconForVisualizationType,
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  getSensibleDisplays,
  getSettingWidgetComponent,
  getVisualization,
  getVisualizationRaw,
  getVisualizationTransformed,
  isCartesianChart,
  registerSettingWidgets,
  registerVisualization,
  setDefaultVisualization,
} from "./lib/registry";
export { extractRemappedColumns, extractRemappings } from "./lib/remapping";

// eslint-disable-next-line import/no-default-export
export { default } from "./lib/registry";
