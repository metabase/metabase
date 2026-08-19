export {
  type RegisteredVisualization,
  type VisualizationComponentLoader,
  canSavePng,
  getRegisteredDefaultSize,
  getIconForVisualizationType,
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  getSettingWidgetComponent,
  getVisualization,
  getVisualizationRaw,
  getVisualizationTransformed,
  canDisplayTimelineEvents,
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
