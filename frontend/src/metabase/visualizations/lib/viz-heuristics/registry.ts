// The only place that knows which variants exist.
import { defaultVizV1Heuristic } from "./default-viz-v1";
import { dimensionTypeHeuristic } from "./dimension-type";
import { legacyDefaultHeuristic } from "./legacy-default";
import { lensHintHeuristic } from "./lens-hint";
import type { VizHeuristic, VizHeuristicId } from "./types";

const DEFAULT_VIZ_HEURISTIC: VizHeuristic = dimensionTypeHeuristic;

export const VIZ_HEURISTICS: readonly VizHeuristic[] = [
  dimensionTypeHeuristic,
  legacyDefaultHeuristic,
  defaultVizV1Heuristic,
  lensHintHeuristic,
];

export const DEFAULT_VIZ_HEURISTIC_ID: VizHeuristicId =
  DEFAULT_VIZ_HEURISTIC.id;

/** Falls back to the default heuristic for unknown ids. */
export function getVizHeuristic(
  id: VizHeuristicId | null | undefined,
): VizHeuristic {
  return (
    VIZ_HEURISTICS.find((heuristic) => heuristic.id === id) ??
    DEFAULT_VIZ_HEURISTIC
  );
}
