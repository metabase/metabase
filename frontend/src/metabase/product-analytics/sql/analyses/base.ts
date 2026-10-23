import type { AnalysisSpec, FlagRef, Period } from "../../spec/types";
import { compileActorPredicate, isEmptyScope } from "../compile/actorPredicate";
import { flagSql } from "../compile/flag";
import { compileGrain } from "../compile/grain";
import type { Cte } from "../compose";

import { actorBreakoutsCte, breakoutEventColumns } from "./breakout";
import { IN_RANGE_FLAG, getLookbackDays } from "./lookback";

export interface BaseBlock {
  ctes: Cte[];
  warnings: string[];
}

export const scopedEvents = (
  spec: AnalysisSpec,
  match?: FlagRef,
  extraColumns: { as: string; sql: string }[] = [],
  extraWhere: string[] = [],
): BaseBlock => {
  const warnings: string[] = [];
  const actor = compileGrain(spec.grain);
  const scope = compileActorPredicate(spec.scope);
  warnings.push(...scope.warnings);
  const hasLookback = getLookbackDays(spec) > 0;

  const rowWhere = [
    ...extraWhere,
    ...(match ? [flagSql(match.flag)] : []),
  ].filter((clause) => clause && clause !== "1");

  const ctes: Cte[] = [];

  if (!isEmptyScope(spec.scope) && scope.having.length > 0) {
    ctes.push({
      name: "scope_actors",
      note: "actors who satisfy the behavioural conditions in “who's included”",
      deps: ["events_base"],
      body: [
        "SELECT",
        `  ${actor} AS actor`,
        "FROM events_base",
        ...(hasLookback ? [`WHERE ${IN_RANGE_FLAG} = 1`] : []),
        "GROUP BY actor",
        `HAVING ${scope.having.join("\n   AND ")}`,
      ].join("\n"),
    });
    rowWhere.push(`${actor} IN (SELECT actor FROM scope_actors)`);
  }

  const columns = [
    `${actor} AS actor`,
    "created_at AS ts",
    "event_name",
    "url_path",
    ...(hasLookback ? [IN_RANGE_FLAG] : []),
    ...[
      ...extraColumns,
      ...(spec.breakout !== undefined
        ? breakoutEventColumns(spec.breakout)
        : []),
    ].map((column) => `${column.sql} AS ${column.as}`),
  ];

  ctes.push({
    name: "scoped_events",
    note: hasLookback
      ? `every event in range, and the ${getLookbackDays(spec)} days before it marked by ${IN_RANGE_FLAG}, for the chosen grain`
      : "every event in range, for the chosen grain",
    deps: scope.having.length
      ? ["events_base", "scope_actors"]
      : ["events_base"],
    body: [
      "SELECT",
      columns.map((column) => `  ${column}`).join(",\n"),
      "FROM events_base",
      rowWhere.length ? `WHERE ${rowWhere.join("\n  AND ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (spec.breakout !== undefined) {
    ctes.push(actorBreakoutsCte(spec.breakout));
  }

  return { ctes, warnings };
};

export const startOf = (unit: Period, expr = "ts"): string =>
  ({
    day: `toStartOfDay(${expr})`,
    week: `toStartOfWeek(${expr}, 1)`,
    month: `toStartOfMonth(${expr})`,
  })[unit];

/** Splits a numbered step label like "2. Signed up", as funnels and paths label steps. */
export const parseStepLabel = (
  value: unknown,
): { step: number; name: string } | null => {
  const match =
    typeof value === "string" ? /^(\d+)\. (.*)$/s.exec(value) : null;
  return match ? { step: Number(match[1]), name: match[2] } : null;
};

/** A clicked point's value as a string, or `null` when it has none. */
export const pointString = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;
