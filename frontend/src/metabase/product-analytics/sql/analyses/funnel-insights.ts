import type { AnalysisSpec, FunnelSpec } from "../../spec/types";
import type { Cte } from "../compose";

import { scopedEvents } from "./base";
import {
  funnelFlags,
  funnelHits,
  funnelOrderedLevel,
  funnelStepTimes,
} from "./funnel";
import {
  type AttributeAsOfRules,
  type InsightPopulation,
  attributeAsOfSql,
  attributeSql,
} from "./insights";

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
  asOf: AttributeAsOfRules,
): { ctes: Cte[]; warnings: string[] } => {
  const ids = attributes.map(attributeSql);
  const asOfSql = (id: string) => attributeAsOfSql(asOf, id);
  const base = scopedEvents(spec, undefined, [
    ...funnelFlags(funnel),
    ...ids.map((id) => ({ as: `${id}_v`, sql: asOfSql(id).value })),
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
            `  if(${id}_first != '' AND ${id}_seen <= reached_at, ${id}_first, ${asOfSql(id).fallback}) AS ${id}`,
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

/**
 * The funnel's insight population, `funnel_transitions`: one row per actor per
 * funnel step they reached. Question k is the transition from step k to step
 * k + 1, numbered from 1. Undefined without at least two steps.
 */
export const funnelInsightPopulation = (
  spec: AnalysisSpec,
  attributes: readonly string[],
  asOf: AttributeAsOfRules,
): InsightPopulation | undefined => {
  const funnel = spec.funnel;
  if (!funnel || funnel.steps.length < 2) {
    return undefined;
  }
  const { ctes, warnings } = transitionCtes(spec, funnel, attributes, asOf);
  return { ctes, source: "funnel_transitions", hasLabels: false, warnings };
};
