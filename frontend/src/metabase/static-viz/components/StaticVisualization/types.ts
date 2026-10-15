import type {
  ComputedVisualizationSettings,
  RenderingContext,
  VisualizationGridSize,
} from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

export interface StaticChartProps {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  renderingContext: RenderingContext;
  width?: number;
  height?: number;
  isStorybook?: boolean;
  hasDevWatermark?: boolean;
  // When true, width/height are the exact output box: charts fit their legend inside it
  fitWithinBounds?: boolean;
  gridSize?: VisualizationGridSize;
}
