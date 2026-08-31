import type { LegendItem } from "metabase/viz-core";

export type PositionedLegendItem = LegendItem & {
  left: number;
  top: number;
  width?: number;
};
