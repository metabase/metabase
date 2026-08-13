export {
  type RegisteredVisualization,
  canSavePng,
  getDefaultSize,
  getIconForVisualizationType,
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  getSettingWidgetComponent,
  getVisualization,
  getVisualizationRaw,
  getVisualizationTransformed,
  isCartesianChart,
  registerSettingWidgets,
  registerVisualization,
  setDefaultVisualization,
  visualizations,
} from "./lib/registry";
export { extractRemappedColumns, extractRemappings } from "./lib/remapping";
