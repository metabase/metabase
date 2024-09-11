import type { RenderingContext } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export interface StaticChartProps {
  rawSeries: RawSeries;
  renderingContext: RenderingContext;
  width?: number;
  height?: number;
  isStorybook?: boolean;
}
