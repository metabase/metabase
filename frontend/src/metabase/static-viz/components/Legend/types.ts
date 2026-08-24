import type { LegendItem } from "metabase/viz-core/echarts/cartesian/model/types";

export type PositionedLegendItem = LegendItem & {
  left: number;
  top: number;
  width?: number;
};
