export {
  type RegisteredVisualization,
  type VisualizationComponentLoader,
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
  loadVisualizationComponents,
  prefetchVisualizationComponent,
  registerSettingWidgets,
  registerVisualization,
  setDefaultVisualization,
  visualizations,
} from "./lib/registry";
export { getVisualizationComponent } from "./visualization-component";
export { extractRemappedColumns, extractRemappings } from "./lib/remapping";
