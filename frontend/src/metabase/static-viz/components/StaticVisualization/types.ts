import type { RenderingContext } from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

export interface StaticChartProps {
  rawSeries: RawSeries;
  dashcardSettings: VisualizationSettings;
  renderingContext: RenderingContext;
  width?: number;
  height?: number;
  isStorybook?: boolean;
}
