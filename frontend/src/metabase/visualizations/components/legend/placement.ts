import type { LegendPosition } from "metabase-types/api";

export type LegendPlacement = Exclude<LegendPosition, "auto" | "off">;

export type LegendOrientation = "horizontal" | "vertical";

interface LegendPlacementConfig {
  orientation: LegendOrientation;
  isBeforeChart: boolean;
}

export const LEGEND_PLACEMENTS = {
  top: { orientation: "horizontal", isBeforeChart: true },
  bottom: { orientation: "horizontal", isBeforeChart: false },
  left: { orientation: "vertical", isBeforeChart: true },
  right: { orientation: "vertical", isBeforeChart: false },
} as const satisfies Record<LegendPlacement, LegendPlacementConfig>;
