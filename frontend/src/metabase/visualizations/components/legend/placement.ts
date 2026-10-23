import type { Padding } from "metabase/viz-core";
import type { LegendPosition } from "metabase-types/api";

export type LegendPlacement = Exclude<LegendPosition, "auto" | "off">;

export type LegendOrientation = "horizontal" | "vertical";

interface LegendPlacementConfig {
  orientation: LegendOrientation;
  isBeforeChart: boolean;
  // the legend's side that faces the chart
  chartSide: keyof Padding;
}

export const LEGEND_PLACEMENTS = {
  top: { orientation: "horizontal", isBeforeChart: true, chartSide: "bottom" },
  bottom: { orientation: "horizontal", isBeforeChart: false, chartSide: "top" },
  left: { orientation: "vertical", isBeforeChart: true, chartSide: "right" },
  right: { orientation: "vertical", isBeforeChart: false, chartSide: "left" },
} as const satisfies Record<LegendPlacement, LegendPlacementConfig>;
