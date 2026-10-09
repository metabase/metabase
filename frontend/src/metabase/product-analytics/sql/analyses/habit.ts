import type { AnalysisSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { grainLabel } from "../compile/grain";
import type { QueryPlan } from "../compose";

import { scopedEvents, splitCols, splitGroup, startOf } from "./base";

export const planHabit = (spec: AnalysisSpec): QueryPlan => {
  const habit = spec.habit;
  if (!habit) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const lookback = seconds({
    value: habit.lookback.value,
    unit: habit.lookback.unit,
  });
  const base = scopedEvents(
    spec,
    habit.active,
    [],
    [`created_at >= now() - INTERVAL ${lookback} SECOND`],
  );
  const people = grainLabel(spec.grain);

  const counts = {
    name: "active_periods",
    note: `how many distinct ${habit.subPeriod}s each ${spec.grain} was active in`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      ...splitCols(base),
      `  uniqExact(${startOf(habit.subPeriod)}) AS periods`,
      "FROM scoped_events",
      `GROUP BY ${splitGroup(base)}actor`,
    ].join("\n"),
  };

  if (habit.measure === "threshold") {
    return {
      ctes: [...base.ctes, counts],
      select: [
        "SELECT",
        `  countIf(periods >= ${habit.threshold}) AS regulars,`,
        `  count() AS ${people},`,
        `  round(countIf(periods >= ${habit.threshold}) / count(), 4) AS share`,
        "FROM active_periods",
      ].join("\n"),
      warnings: base.warnings,
    };
  }

  if (habit.measure === "ratio") {
    const daily = {
      name: "daily_actives",
      note: "actives per day, and per trailing 30 days",
      deps: ["scoped_events"],
      body: [
        "SELECT",
        "  toStartOfDay(ts) AS day,",
        "  uniqExact(actor) AS dau,",
        "  uniqExactIf(actor, ts >= toStartOfDay(ts) - INTERVAL 30 DAY) AS mau",
        "FROM scoped_events",
        "GROUP BY day",
      ].join("\n"),
    };
    return {
      ctes: [...base.ctes, daily],
      select: [
        "SELECT",
        "  day,",
        "  dau,",
        "  mau,",
        "  round(dau / nullIf(mau, 0), 4) AS ratio",
        "FROM daily_actives",
        "ORDER BY day",
      ].join("\n"),
      warnings: [
        ...base.warnings,
        "DAU/MAU compares each day against a trailing 30 days inside the selected range, so the earliest days in the range have a short denominator.",
      ],
    };
  }

  return {
    ctes: [...base.ctes, counts],
    select: [
      "SELECT",
      ...splitCols(base),
      "  periods,",
      `  count() AS ${people}`,
      "FROM active_periods",
      `GROUP BY ${splitGroup(base)}periods`,
      "ORDER BY periods",
    ].join("\n"),
    warnings: [
      ...base.warnings,
      `The histogram is capped by the lookback: at most ${habit.lookback.value} ${habit.lookback.unit}s of ${habit.subPeriod}s.`,
    ],
  };
};
