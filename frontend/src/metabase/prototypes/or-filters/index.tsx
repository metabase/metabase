import type { PrototypeDefinition } from "../types";

import { OrFilterCanvas } from "./OrFilterCanvas";
import { FILTER_DIRECTIONS } from "./directions";

/** One rail entry per OR-filter direction, each inside the shared harness. */
export const OR_FILTER_PROTOTYPES: PrototypeDefinition[] =
  FILTER_DIRECTIONS.map((direction) => ({
    id: direction.id,
    get name() {
      return direction.name;
    },
    get description() {
      return direction.description;
    },
    Component: function OrFilterPrototype() {
      return <OrFilterCanvas direction={direction} />;
    },
  }));
