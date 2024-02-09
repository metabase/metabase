import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import type { RenderingContext } from "metabase/visualizations/types";

export interface IsomorphicStaticChartProps {
  rawSeries: RawSeries;
  dashcardSettings: VisualizationSettings;
  renderingContext: RenderingContext;
  width?: number;
  height?: number;
  isStorybook?: boolean;
}
