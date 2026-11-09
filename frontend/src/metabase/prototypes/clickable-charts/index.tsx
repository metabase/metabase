import { t } from "ttag";

import type { PrototypeDefinition } from "../types";

import { ClickableChartCanvas } from "./ClickableChartCanvas";
import { BASELINE_DIRECTION, ITERATION_1_DIRECTIONS } from "./directions";
import type { ChartDirection } from "./types";

function toPrototype(
  direction: ChartDirection,
  group?: string,
): PrototypeDefinition {
  return {
    id: direction.id,
    get name() {
      return direction.name;
    },
    get description() {
      return direction.description;
    },
    group,
    draft: direction.draft,
    Component: function ClickableChartPrototype() {
      return <ClickableChartCanvas direction={direction} />;
    },
  };
}

/** Baseline first, above the iterations; then one rail entry per direction, each inside the shared chart harness. */
export const CLICKABLE_CHARTS_PROTOTYPES: PrototypeDefinition[] = [
  toPrototype(BASELINE_DIRECTION),
  ...ITERATION_1_DIRECTIONS.map((direction) =>
    toPrototype(direction, t`Iteration 1`),
  ),
];
