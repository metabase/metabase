import { t } from "ttag";

import { EXAMPLES } from "../harness/examples";
import type { ChartDirection } from "../types";

import { AxisSideQuestPrototype } from "./axis-side-quest/AxisSideQuestPrototype";
import { BaselinePrototype } from "./baseline/BaselinePrototype";
import {
  DirectManipulationPrototype,
  supportsDirectManipulation,
} from "./direct-manipulation/DirectManipulationPrototype";

/** Today's behavior; sits above the iterations in the rail for comparison. */
export const BASELINE_DIRECTION: ChartDirection = {
  id: "baseline",
  get name() {
    return t`Baseline`;
  },
  get description() {
    return t`Today's chart. Clicking a point, bar or legend item opens the drill popover; nothing is draggable.`;
  },
  Component: BaselinePrototype,
};

/**
 * One list per round of prototyping. Add a direction here; the rail picks it
 * up under the group `index.tsx` assigns to the list.
 */
export const ITERATION_1_DIRECTIONS: ChartDirection[] = [
  {
    id: "axis-side-quest",
    get name() {
      return t`Interacting with axes`;
    },
    get description() {
      return t`Axes that answer back. The measure title (y-axis, or legend item) swaps the measure, adds one to compare or splits it into series; the dimension title changes or regroups it. Filter, sort and top 10 sit under a line in each menu. Charts without axes get the same two pills above the chart.`;
    },
    Component: AxisSideQuestPrototype,
    initialExample: EXAMPLES.find((example) => example.display === "bar"),
    // A raw table has no measure or dimension to point at.
    supportsExample: (example) => example.display !== "table",
  },
  {
    id: "direct-manipulation",
    get name() {
      return t`Drag axes: threshold, range`;
    },
    get description() {
      return t`Axes are handles. Click an axis to place a line, drag along it to select a span. On the y-axis that is a threshold or a band of values; on the x-axis a cut or a range. A line's menu flips between ≥ and ≤; the chart previews what is kept.`;
    },
    Component: DirectManipulationPrototype,
    initialExample: EXAMPLES.find((example) => example.display === "line"),
    supportsExample: supportsDirectManipulation,
  },
];
