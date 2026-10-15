import type { AnalysisSpec, FlagRef, Period } from "../../spec/types";
import { compileActorPredicate, isEmptyScope } from "../compile/actorPredicate";
import { flagSql } from "../compile/flag";
import { compileGrain } from "../compile/grain";
import type { Cte } from "../compose";

export interface BaseBlock {
  ctes: Cte[];
  splitColumn?: string;
  warnings: string[];
}

export const SPLIT_COLUMN = "split_value";

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
        "GROUP BY actor",
        `HAVING ${scope.having.join("\n   AND ")}`,
      ].join("\n"),
    });
    rowWhere.push(`${actor} IN (SELECT actor FROM scope_actors)`);
  }

  const columns = [
    `${actor} AS actor`,
    "created_at AS ts",
    ...(spec.split ? [`${SPLIT_COLUMN}`] : []),
    "event_name",
    "url_path",
    ...extraColumns.map((column) => `${column.sql} AS ${column.as}`),
  ];

  ctes.push({
    name: "scoped_events",
    note: "every event in range, for the chosen grain",
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

  return {
    ctes,
    ...(spec.split ? { splitColumn: SPLIT_COLUMN } : {}),
    warnings,
  };
};

export const startOf = (unit: Period, expr = "ts"): string =>
  ({
    day: `toStartOfDay(${expr})`,
    week: `toStartOfWeek(${expr}, 1)`,
    month: `toStartOfMonth(${expr})`,
  })[unit];

export const splitCols = (block: BaseBlock): string[] =>
  block.splitColumn ? [`  ${block.splitColumn},`] : [];

export const splitGroup = (block: BaseBlock): string =>
  block.splitColumn ? `${block.splitColumn}, ` : "";
