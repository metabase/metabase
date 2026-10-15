import type { AnalysisSpec } from "../../spec/types";
import { INTERVAL } from "../compile/dialect";
import type { QueryPlan } from "../compose";

import { scopedEvents, startOf } from "./base";

export const planLifecycle = (spec: AnalysisSpec): QueryPlan => {
  const lifecycle = spec.lifecycle;
  if (!lifecycle) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const base = scopedEvents(spec, lifecycle.active);
  const period = lifecycle.period;
  const step = INTERVAL[period];

  const periods = {
    name: "actor_periods",
    note: `one row per ${spec.grain} per ${period} they were active`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  ${startOf(period)} AS period`,
      "FROM scoped_events",
      "GROUP BY actor, period",
    ].join("\n"),
  };

  const classified = {
    name: "classified",
    note: "each active period, compared against the actor's previous one",
    deps: ["actor_periods"],
    body: [
      "SELECT",
      "  actor,",
      "  period,",
      "  lagInFrame(period) OVER (PARTITION BY actor ORDER BY period) AS previous,",
      "  min(period) OVER (PARTITION BY actor) AS first_period,",
      "  multiIf(",
      "    period = first_period, 'new',",
      `    previous = period - INTERVAL ${step}, 'returning',`,
      "    'resurrected'",
      "  ) AS state",
      "FROM actor_periods",
    ].join("\n"),
  };

  const quiet = {
    name: "went_quiet",
    note: "the period after each actor's last active one, where they did not return",
    deps: ["actor_periods"],
    body: [
      "SELECT",
      `  period + INTERVAL ${step} AS period,`,
      "  count() AS actors",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    period,",
      "    leadInFrame(period) OVER (PARTITION BY actor ORDER BY period",
      "      ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next_period",
      "  FROM actor_periods",
      ")",
      `WHERE next_period <= period OR next_period > period + INTERVAL ${step}`,
      "GROUP BY period",
    ].join("\n"),
  };

  const shown = spec.output.lifecycleShown ?? [
    "new",
    "returning",
    "resurrected",
    "dormant",
  ];
  const wanted = shown.filter((state) => state !== "dormant");

  return {
    ctes: [...base.ctes, periods, classified, quiet],
    select: [
      "SELECT period, state, actors FROM (",
      "  SELECT period, state, count() AS actors",
      "  FROM classified",
      wanted.length
        ? `  WHERE state IN (${wanted.map((s) => `'${s}'`).join(", ")})`
        : "  WHERE 0",
      "  GROUP BY period, state",
      "  UNION ALL",
      "  SELECT period, 'dormant' AS state, -actors AS actors",
      `  FROM went_quiet${shown.includes("dormant") ? "" : "\n  WHERE 0"}`,
      ")",
      "ORDER BY period, state",
    ].join("\n"),
    warnings: [
      ...base.warnings,
      "“Went quiet” is derived from gaps between active periods, so an actor who never returns is counted quiet once — in the period after their last activity.",
    ],
  };
};
