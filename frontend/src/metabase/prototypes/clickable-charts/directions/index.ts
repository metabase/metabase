import { t } from "ttag";

import { EXAMPLES } from "../harness/examples";
import type { ChartDirection } from "../types";

import { AxisSideQuestPrototype } from "./axis-side-quest/AxisSideQuestPrototype";
import { BaselinePrototype } from "./baseline/BaselinePrototype";

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
  },
];
