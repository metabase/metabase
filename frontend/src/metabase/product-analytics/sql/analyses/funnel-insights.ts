import type { AnalysisSpec, FunnelSpec } from "../../spec/types";
import { ident, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents } from "./base";
import {
  funnelFlags,
  funnelHits,
  funnelOrderedLevel,
  funnelStepTimes,
} from "./funnel";

/** The value an attribute has in `funnel_transitions` when it wasn't seen in time. */
export const NOT_SET_VALUE = "(not set)";
/** The value pass 2 gives the values it doesn't keep. Never returned. */
const OTHER_VALUE = "(other)";
/** Columns of the explore query besides the segment. */
export const EXPLORE_PEOPLE_COLUMN = "people";
export const EXPLORE_CONVERSION_COLUMN = "conversion";

export type FunnelInsightsQuery =
  /** Counts per transition, for each attribute on its own. */
  | { kind: "singles"; attributes: readonly string[] }
  /** Counts per transition, for each pair of attributes, over the kept values. */
  | {
      kind: "pairs";
      kept: ReadonlyMap<string, readonly string[]>;
    }
  /** People and conversion for one transition, by each combination of the attributes' values. */
  | {
      kind: "explore";
      transition: number;
      attributes: readonly string[];
      /** The name of the column holding the combined values. */
      segmentLabel: string;
    };

const attributesOf = (query: FunnelInsightsQuery): string[] => {
  switch (query.kind) {
    case "singles":
      return [...query.attributes];
    case "pairs":
      return [...query.kept.keys()];
    case "explore":
      return [...query.attributes];
  }
};

/** Attribute ids are column names on `events_base`, so they're validated like flags. */
const attributeSql = (id: string): string => flagSql(id);

/**
 * Per-actor level for any ordering. With "any", the level is how many of the
 * leading steps the actor did, in any order.
 */
const levelColumns = (
  funnel: FunnelSpec,
): { sql: string; warnings: string[] } => {
  if (funnel.ordering !== "any") {
    return funnelOrderedLevel(funnel);
  }
  const branches = funnel.steps
    .map((_, index) => {
      const hits = Array.from(
        { length: index + 1 },
        (_, k) => `hit_${k + 1}`,
      ).join(" AND ");
      return `    ${hits}, ${index + 1},`;
    })
    .reverse();
  return {
    sql: [
      funnelHits(funnel),
      ["  multiIf(", ...branches, "    0", "  ) AS level"].join("\n"),
    ].join(",\n"),
    warnings: [],
  };
};

const transitionCtes = (
  spec: AnalysisSpec,
  funnel: FunnelSpec,
  attributes: readonly string[],
): { ctes: Cte[]; warnings: string[] } => {
  const ids = attributes.map(attributeSql);
  const base = scopedEvents(spec, undefined, [
    ...funnelFlags(funnel),
    ...ids.map((id) => ({ as: `${id}_v`, sql: `ifNull(toString(${id}), '')` })),
  ]);
  const level = levelColumns(funnel);
  const n = funnel.steps.length;
  const stepTimes = funnel.steps.map((_, index) => `t_${index + 1}`).join(", ");

  const people: Cte = {
    name: "funnel_people",
    note: "one row per actor: how far they got, when they did each step, and the first value seen for each attribute",
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      level.sql + ",",
      funnelStepTimes(funnel) + (ids.length > 0 ? "," : ""),
      ids
        .flatMap((id) => [
          `  argMinIf(${id}_v, ts, ${id}_v != '') AS ${id}_first`,
          `  minIf(ts, ${id}_v != '') AS ${id}_seen`,
        ])
        .join(",\n"),
      "FROM scoped_events",
      "GROUP BY actor",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  // An attribute only counts once it was seen by the time the actor reached
  // step k, so a value first recorded on a later step can't predict reaching it.
  const transitions: Cte = {
    name: "funnel_transitions",
    note: "one row per actor per step they reached: whether they reached the next one, and each attribute as of reaching this one",
    deps: ["funnel_people"],
    body: [
      "SELECT",
      "  actor,",
      "  k,",
      "  level >= k + 1 AS converted,",
      `  arrayMax(arraySlice([${stepTimes}], 1, k)) AS reached_at` +
        (ids.length > 0 ? "," : ""),
      ids
        .map(
          (id) =>
            `  if(${id}_first != '' AND ${id}_seen <= reached_at, ${id}_first, ${lit(NOT_SET_VALUE)}) AS ${id}`,
        )
        .join(",\n"),
      "FROM funnel_people",
      `ARRAY JOIN range(1, ${n}) AS k`,
      "WHERE level >= k",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const warnings = [...base.warnings, ...level.warnings];
  if (funnel.exclusions.length > 0) {
    warnings.push("Insights don't apply disqualifiers yet.");
  }
  return { ctes: [...base.ctes, people, transitions], warnings };
};

const COUNTS = ["  count() AS reached,", "  countIf(converted) AS converted"];

// Columns outside a grouping set come back as '', which no attribute value is.
const singlesSelect = (attributes: readonly string[]): string => {
  const ids = attributes.map(attributeSql);
  const sets = ["(k)", ...ids.map((id) => `(k, ${id})`)];
  return [
    "SELECT",
    "  k,",
    ...ids.map((id) => `  ${id},`),
    ...COUNTS,
    "FROM funnel_transitions",
    `GROUP BY GROUPING SETS (${sets.join(", ")})`,
  ].join("\n");
};

const pairsSelect = (kept: ReadonlyMap<string, readonly string[]>): string => {
  const ids = [...kept.keys()].map(attributeSql);
  const sets = ids.flatMap((a, index) =>
    ids.slice(index + 1).map((b) => `(k, ${a}_kept, ${b}_kept)`),
  );
  return [
    "SELECT",
    "  k,",
    ...ids.map((id) => `  ${id}_kept AS ${id},`),
    ...COUNTS,
    "FROM (",
    "  SELECT",
    "    k,",
    "    converted,",
    [...kept]
      .map(
        ([id, values]) =>
          `    if(${attributeSql(id)} IN (${values.map(lit).join(", ")}), ${attributeSql(id)}, ${lit(OTHER_VALUE)}) AS ${attributeSql(id)}_kept`,
      )
      .join(",\n"),
    "  FROM funnel_transitions",
    ")",
    `GROUP BY GROUPING SETS (${sets.join(", ")})`,
    `HAVING ${ids.map((id) => `${id} != ${lit(OTHER_VALUE)}`).join(" AND ")}`,
  ].join("\n");
};

const exploreSelect = (
  transition: number,
  attributes: readonly string[],
  segmentLabel: string,
): string => {
  const ids = attributes.map(attributeSql);
  const segment =
    ids.length === 1 ? ids.join("") : `concat(${ids.join(", ' · ', ")})`;
  return [
    "SELECT",
    `  ${segment} AS ${ident(segmentLabel)},`,
    `  count() AS ${EXPLORE_PEOPLE_COLUMN},`,
    `  round(countIf(converted) / count(), 4) AS ${EXPLORE_CONVERSION_COLUMN}`,
    "FROM funnel_transitions",
    `WHERE k = ${Math.trunc(transition)}`,
    `GROUP BY ${ident(segmentLabel)}`,
    `ORDER BY ${EXPLORE_PEOPLE_COLUMN} DESC`,
  ].join("\n");
};

/**
 * Queries over `funnel_transitions`, one row per actor per funnel step they
 * reached. Transition k is step k → step k+1, numbered from 1.
 */
export const planFunnelInsights = (
  spec: AnalysisSpec,
  query: FunnelInsightsQuery,
): QueryPlan => {
  const funnel = spec.funnel;
  if (!funnel || funnel.steps.length < 2) {
    return {
      ctes: [],
      select: "SELECT 'Add at least two steps' AS message",
      warnings: ["The funnel needs at least two steps for insights."],
    };
  }
  const { ctes, warnings } = transitionCtes(spec, funnel, attributesOf(query));
  const select = (() => {
    switch (query.kind) {
      case "singles":
        return singlesSelect(query.attributes);
      case "pairs":
        return pairsSelect(query.kept);
      case "explore":
        return exploreSelect(
          query.transition,
          query.attributes,
          query.segmentLabel,
        );
    }
  })();
  return { ctes, select, warnings };
};
