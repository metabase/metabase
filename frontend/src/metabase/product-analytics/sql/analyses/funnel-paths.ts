import { t } from "ttag";

import type { AnalysisSpec, FunnelSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { lit } from "../compile/dialect";
import type { Cte, QueryPlan } from "../compose";

import { funnelChainsCte, funnelLevels } from "./funnel";
import {
  PATHS_COLUMNS,
  kindSql,
  pathNodeKeySql,
  pathNodeLabelSql,
  stepNameSql,
} from "./path-nodes";

export type FunnelPathsRange = {
  /** The funnel step the paths start from, numbered from 1. */
  start: number;
  /** The funnel step that counts as converting, after `start`. */
  end: number;
};

export type FunnelPathsQuery = FunnelPathsRange & {
  /** How many steps to show after the starting one before collapsing the rest. */
  steps: number;
  /** How many events to show at each step before grouping the rest into Other. */
  maxNodes: number;
};

/** The column that tells converted paths from the rest, and its values. */
export const OUTCOME_COLUMN = "outcome";
export const getOutcomeLabels = () => ({
  converted: t`Converted`,
  notConverted: t`Didn't convert`,
});

export const isValidFunnelPathsRange = (
  funnel: FunnelSpec,
  { start, end }: FunnelPathsRange,
): boolean =>
  Number.isInteger(start) &&
  Number.isInteger(end) &&
  start >= 1 &&
  start < end &&
  end <= funnel.steps.length;

const MORE_NODE = `('', ${kindSql("more")})`;
const DROPPED_NODE = `('', ${kindSql("dropped")})`;

/**
 * The paths of the people who reached funnel step `start`, until they reached
 * step `end` or, for the rest, until the funnel's window closed. Each link is
 * split by whether its people converted.
 */
export const planFunnelPaths = (
  spec: AnalysisSpec,
  { start, end, steps, maxNodes }: FunnelPathsQuery,
): QueryPlan => {
  const funnel = spec.funnel;
  if (!funnel || !isValidFunnelPathsRange(funnel, { start, end })) {
    return {
      ctes: [],
      select: "SELECT 'Pick a starting and an ending step' AS message",
      warnings: ["The paths need a starting step before their ending step."],
    };
  }
  if (funnel.ordering === "any") {
    return {
      ctes: [],
      select: "SELECT 'Paths need ordered steps' AS message",
      warnings: ["Paths aren't available when steps can happen in any order."],
    };
  }

  const startLabel = funnel.steps[start - 1].label;
  const endLabel = funnel.steps[end - 1].label;
  const window = seconds(funnel.window);
  const outcomes = getOutcomeLabels();
  const moreLabel = t`(> ${steps} steps)`;
  const windowStart =
    funnel.anchor === "each" ? `c.chain_times[${start}]` : "c.chain_times[1]";

  // Splitting would give an actor a row per split value.
  const levels = funnelLevels({ ...spec, split: false }, funnel, [
    { as: "step_name", sql: stepNameSql(spec) },
  ]);

  const ctes: Cte[] = [
    ...levels.ctes,
    funnelChainsCte(funnel),
    {
      name: "path_bounds",
      note: `each actor who reached step ${start}: whether they converted, and when their path starts and ends`,
      deps: [levels.source, "funnel_chains"],
      body: [
        "SELECT",
        "  l.actor AS actor,",
        `  l.level >= ${end} AND length(c.chain_times) >= ${end} AS converted,`,
        `  c.chain_times[${start}] AS path_start,`,
        `  if(converted, c.chain_times[${end}], addSeconds(${windowStart}, ${window})) AS path_end`,
        `FROM ${levels.source} AS l`,
        "INNER JOIN funnel_chains AS c ON c.actor = l.actor",
        `WHERE l.level >= ${start} AND length(c.chain_times) >= ${start}`,
      ].join("\n"),
    },
    {
      name: "path_events",
      note: "each actor's events from the starting step to the ending step, or to the end of the window",
      deps: ["scoped_events", "path_bounds"],
      body: [
        "SELECT",
        "  e.actor AS actor,",
        "  b.converted AS converted,",
        "  e.ts AS ts,",
        `  e.ts = b.path_start AND e.step_${start} AS is_start,`,
        `  b.converted AND e.ts = b.path_end AND e.step_${end} AS is_end,`,
        "  multiIf(is_start, 0, is_end, 2, 1) AS tiebreak,",
        `  multiIf(is_start, ${lit(startLabel)}, is_end, ${lit(endLabel)}, e.step_name) AS name,`,
        `  if(is_end, ${kindSql("converted")}, ${kindSql("step")}) AS kind,`,
        "  e.step_name AS raw_name",
        "FROM scoped_events AS e",
        "INNER JOIN path_bounds AS b ON b.actor = e.actor",
        "WHERE e.ts <= b.path_end",
        "  AND (e.ts > b.path_start OR is_start)",
        "  AND (e.ts < b.path_end OR is_end OR NOT b.converted)",
      ].join("\n"),
    },
    {
      name: "path_sequences",
      note: "each actor's events in order, with consecutive repeats of the same event merged — the funnel steps are named by their step, so repeats compare the event's own name",
      deps: ["path_events"],
      body: [
        "SELECT",
        "  actor,",
        "  any(converted) AS converted,",
        "  arraySort(groupArray((ts, tiebreak, name, kind, raw_name))) AS sorted,",
        "  arrayMap(",
        "    e -> (e.3, e.4),",
        "    arrayFilter(",
        `      (e, i) -> i = 1 OR e.5 != sorted[i - 1].5 OR e.4 = ${kindSql("converted")},`,
        "      sorted,",
        "      arrayEnumerate(sorted)",
        "    )",
        "  ) AS nodes",
        "FROM path_events",
        "GROUP BY actor",
      ].join("\n"),
    },
    {
      name: "funnel_paths",
      note: `each actor's path: the first ${steps} steps after the starting one, then the ending step or a drop-off`,
      deps: ["path_sequences"],
      body: [
        "SELECT",
        "  actor,",
        "  converted,",
        "  multiIf(",
        `    converted AND length(nodes) - 2 > ${steps}, arrayConcat(arraySlice(nodes, 1, ${steps + 1}), [${MORE_NODE}, nodes[-1]]),`,
        "    converted, nodes,",
        `    length(nodes) - 1 > ${steps}, arrayConcat(arraySlice(nodes, 1, ${steps + 1}), [${MORE_NODE}, ${DROPPED_NODE}]),`,
        `    arrayPushBack(nodes, ${DROPPED_NODE})`,
        "  ) AS path",
        "FROM path_sequences",
      ].join("\n"),
    },
    {
      name: "path_positions",
      note: "one row per node of each path",
      deps: ["funnel_paths"],
      body: [
        "SELECT",
        "  actor,",
        "  converted,",
        "  position,",
        "  node.1 AS name,",
        "  node.2 AS kind",
        "FROM funnel_paths",
        "ARRAY JOIN path AS node, arrayEnumerate(path) AS position",
      ].join("\n"),
    },
    {
      name: "kept_nodes",
      note: `the ${maxNodes} most common events at each step — the rest are grouped into Other`,
      deps: ["path_positions"],
      body: [
        "SELECT position, name",
        "FROM path_positions",
        `WHERE kind = ${kindSql("step")}`,
        "GROUP BY position, name",
        "ORDER BY position, count() DESC, name",
        `LIMIT ${maxNodes} BY position`,
      ].join("\n"),
    },
    {
      name: "grouped_nodes",
      note: "each path's nodes, with the events too small to show grouped into Other",
      deps: ["path_positions", "kept_nodes"],
      body: [
        "SELECT",
        "  actor,",
        "  converted,",
        "  position,",
        "  if(is_other, '', name) AS name,",
        `  if(is_other, ${kindSql("other")}, kind) AS kind`,
        "FROM (",
        "  SELECT",
        "    *,",
        `    kind = ${kindSql("step")} AND (position, name) NOT IN (SELECT position, name FROM kept_nodes) AS is_other`,
        "  FROM path_positions",
        ")",
      ].join("\n"),
    },
    {
      name: "edges",
      note: "one row per actor per link — keys carry the step number so a repeated event is a new node, not a loop",
      deps: ["grouped_nodes"],
      body: [
        "SELECT",
        "  position AS step,",
        `  ${pathNodeKeySql("position", "kind", "name")} AS source,`,
        `  ${pathNodeKeySql("position + 1", "next_kind", "next_name")} AS target,`,
        `  ${pathNodeLabelSql("kind", "name", moreLabel)} AS ${PATHS_COLUMNS.sourceLabel},`,
        `  ${pathNodeLabelSql("next_kind", "next_name", moreLabel)} AS ${PATHS_COLUMNS.targetLabel},`,
        `  next_kind AS ${PATHS_COLUMNS.targetKind},`,
        "  converted,",
        "  actor",
        "FROM (",
        "  SELECT",
        "    actor,",
        "    converted,",
        "    position,",
        "    name,",
        "    kind,",
        "    leadInFrame(name, 1, '') OVER (PARTITION BY actor ORDER BY position",
        "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_name,",
        "    leadInFrame(kind, 1, '') OVER (PARTITION BY actor ORDER BY position",
        "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_kind",
        "  FROM grouped_nodes",
        ")",
        "WHERE next_kind != ''",
      ].join("\n"),
    },
  ];

  return {
    ctes,
    select: [
      "SELECT",
      "  step,",
      "  source,",
      "  target,",
      `  ${PATHS_COLUMNS.sourceLabel},`,
      `  ${PATHS_COLUMNS.targetLabel},`,
      `  ${PATHS_COLUMNS.targetKind},`,
      `  if(converted, ${lit(outcomes.converted)}, ${lit(outcomes.notConverted)}) AS ${OUTCOME_COLUMN},`,
      "  count() AS weight",
      "FROM edges",
      `GROUP BY step, source, target, ${PATHS_COLUMNS.sourceLabel}, ${PATHS_COLUMNS.targetLabel}, ${PATHS_COLUMNS.targetKind}, converted`,
      "ORDER BY step, converted DESC, weight DESC",
    ].join("\n"),
    warnings: levels.warnings,
  };
};
