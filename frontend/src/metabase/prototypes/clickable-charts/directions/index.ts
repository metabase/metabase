import { t } from "ttag";

import type { ChartDirection } from "../types";

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
export const ITERATION_1_DIRECTIONS: ChartDirection[] = [];
