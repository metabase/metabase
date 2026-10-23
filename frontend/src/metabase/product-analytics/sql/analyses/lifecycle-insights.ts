import type { AnalysisSpec, LifecycleStateName } from "../../spec/types";
import { INTERVAL, lit } from "../compile/dialect";

import {
  type EventCountAttribute,
  eventActivityBase,
  eventActivityCte,
  eventActivityRowColumns,
} from "./event-activity";
import type { InsightPopulation } from "./insights";
import {
  lifecycleEventColumns,
  lifecyclePeriodColumns,
  lifecycleStateColumns,
} from "./lifecycle";

export type LifecycleInsightState = Exclude<LifecycleStateName, "dormant">;

/** The states a period can start from, by question number from 1. */
export const LIFECYCLE_INSIGHT_STATES: readonly LifecycleInsightState[] = [
  "new",
  "returning",
  "resurrected",
];

/**
 * Lifecycle's insight population, `lifecycle_returns`: one row per actor per
 * period they were active in. Question k is the state they were in that
 * period, new, returning or resurrected, and they convert when they're active
 * the next period too. Attributes are whether they did each event at least so
 * many times that period.
 *
 * People who are more active come back more, and do everything more, so each
 * row's `expected` chance of coming back is the rate of everyone in the same
 * state who was as active: active in as many days (hours, for a day) and with
 * as many events, to a power of 2. Without the second, an event that comes
 * with heavy use, like an error, would look like a reason to come back.
 *
 * States come from `lifecycleStateColumns`, so they match the lifecycle
 * chart. The last period is left out, since there's no next one to come back
 * in, and so is the one before it, since the last may be cut short.
 */
export const lifecycleInsightPopulation = (
  spec: AnalysisSpec,
  attributes: readonly EventCountAttribute[],
): InsightPopulation | undefined => {
  const lifecycle = spec.lifecycle;
  if (lifecycle === undefined) {
    return undefined;
  }
  const period = lifecycle.period;
  const step = `INTERVAL ${INTERVAL[period]}`;
  const base = eventActivityBase(
    spec,
    lifecycle.active,
    attributes,
    lifecycleEventColumns(lifecycle),
  );
  const activity = eventActivityCte(
    spec,
    period,
    attributes,
    lifecyclePeriodColumns(lifecycle),
  );
  const states = {
    name: "lifecycle_states",
    note: "each active period's lifecycle state, and the actor's next active period",
    deps: [activity.name],
    body: [
      "SELECT",
      "  *,",
      "  leadInFrame(period) OVER (PARTITION BY actor ORDER BY period",
      "    ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next,",
      lifecycleStateColumns(lifecycle)
        .map((column) => `  ${column}`)
        .join("\n"),
      `FROM ${activity.name}`,
    ].join("\n"),
  };
  const periods = {
    name: "lifecycle_periods",
    note: "one row per active period in the range with a next one in it: its state, whether they came back, and the attributes",
    deps: [states.name, activity.name],
    body: [
      "SELECT",
      "  actor,",
      `  indexOf([${LIFECYCLE_INSIGHT_STATES.map(lit).join(", ")}], state) AS k,`,
      `  next = period + ${step} AS converted,`,
      eventActivityRowColumns(attributes)
        .map((column) => `  ${column}`)
        .join(",\n"),
      `FROM ${states.name}`,
      "WHERE in_range = 1",
      `  AND period + ${step} < (SELECT max(period) FROM ${activity.name} WHERE in_range = 1)`,
    ].join("\n"),
  };
  // PROTOTYPE: compared with everyone else, not with an expected rate for
  // people as active. Metabot holds activity fixed itself, in the open, when
  // a finding might just be "busier people do more".
  return {
    ctes: [...base.ctes, activity, states, periods],
    source: periods.name,
    hasLabels: false,
    warnings: base.warnings,
  };
};
