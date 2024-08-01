import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";

export type PositionedLegendItem = LegendItem & {
  left: number;
  top: number;
  width?: number;
};
