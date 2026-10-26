import { t } from "ttag";

import type { PrototypeDefinition, PrototypeIteration } from "../types";

import { OrFilterCanvas } from "./OrFilterCanvas";
import { FILTER_DIRECTIONS } from "./directions";
import { ITERATION_2_DIRECTIONS } from "./directions/iteration2";
import { ITERATION_3_DIRECTIONS } from "./directions/iteration3";
import { DrillsDocs } from "./docs/DrillsDocs";
import type { FilterDirection } from "./types";

const DRILLS_DOCS: PrototypeDefinition = {
  id: "drills",
  get name() {
    return t`Drill-throughs`;
  },
  get description() {
    return t`Reference: every drill, what it writes into the query, and how to reach it from the harness examples.`;
  },
  Component: DrillsDocs,
};

function toPrototype(
  direction: FilterDirection,
  iteration: PrototypeIteration,
): PrototypeDefinition {
  return {
    id: direction.id,
    get name() {
      return direction.name;
    },
    get description() {
      return direction.description;
    },
    iteration,
    Component: function OrFilterPrototype() {
      return <OrFilterCanvas direction={direction} />;
    },
  };
}

/** The drills reference first, then one rail entry per OR-filter direction, each inside the shared harness. */
export const OR_FILTER_PROTOTYPES: PrototypeDefinition[] = [
  DRILLS_DOCS,
  ...FILTER_DIRECTIONS.map((direction) => toPrototype(direction, 1)),
  ...ITERATION_2_DIRECTIONS.map((direction) => toPrototype(direction, 2)),
  ...ITERATION_3_DIRECTIONS.map((direction) => toPrototype(direction, 3)),
];
