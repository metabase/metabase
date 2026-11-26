import { DBT_EXPLORATION_PROTOTYPES } from "./dbt_exploration";
import { METRICS_PROTOTYPES } from "./metrics";
import type { PrototypeDefinition } from "./types";

/** Every prototype the canvas lists, in rail order. */
export const PROTOTYPES: PrototypeDefinition[] = [
  // Before the metrics work so /prototypes still opens its newest prototype.
  ...DBT_EXPLORATION_PROTOTYPES,
  ...METRICS_PROTOTYPES,
];
