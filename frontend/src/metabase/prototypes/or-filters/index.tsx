import type { PrototypeDefinition, PrototypeIteration } from "../types";

import { OrFilterCanvas } from "./OrFilterCanvas";
import { FILTER_DIRECTIONS } from "./directions";
import { ITERATION_2_DIRECTIONS } from "./directions/iteration2";
import type { FilterDirection } from "./types";

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

/** One rail entry per OR-filter direction, each inside the shared harness. */
export const OR_FILTER_PROTOTYPES: PrototypeDefinition[] = [
  ...FILTER_DIRECTIONS.map((direction) => toPrototype(direction, 1)),
  ...ITERATION_2_DIRECTIONS.map((direction) => toPrototype(direction, 2)),
];
