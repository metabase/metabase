import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
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
}
