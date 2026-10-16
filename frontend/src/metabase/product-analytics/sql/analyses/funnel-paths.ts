import { t } from "ttag";

import type { AnalysisSpec, FunnelSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { lit } from "../compile/dialect";
import type { Cte, QueryPlan } from "../compose";

import { funnelLevels } from "./funnel";
import {
  PATHS_COLUMNS,
  kindSql,
  pathNodeKeySql,
  pathNodeLabelSql,
} from "./path-nodes";
import { STEP_NAME_SQL } from "./paths";

export type FunnelPathsRange = {
  /** The funnel step the paths start from, numbered from 1. */
  start: number;
  /** The funnel step that counts as converting, after `start`. */
  end: number;
};

export type FunnelPathsQuery = {
  /**
   * Ranges that don't overlap, in order: each one's start is at or after the
   * previous one's end. Each event is then in at most one range's path, or
   * two at the step where one range ends and the next starts.
   */
  ranges: readonly FunnelPathsRange[];
  /** How many steps to show after the starting one before collapsing the rest. */
  steps: number;
  /** How many events to show at each step before grouping the rest into Other. */
  maxNodes: number;
  /**
   * Also count people by the first thing they did after each range's
   * starting step, in extra rows where `source` is empty.
   */
  withFirstEvents?: boolean;
};

/** Which of the query's ranges a row is for, numbered from 1. */
export const RANGE_COLUMN = "path_range";
/** The column that tells converted paths from the rest, and its values. */
export const OUTCOME_COLUMN = "outcome";
/** In first-event rows: the event, and how many of `weight` converted. */
export const FIRST_EVENT_COLUMN = "first_event";
export const CONVERTED_WEIGHT_COLUMN = "converted_weight";
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

const areValidFunnelPathsRanges = (
  funnel: FunnelSpec,
  ranges: readonly FunnelPathsRange[],
): boolean =>
  ranges.length > 0 &&
  ranges.every(
    (range, index) =>
      isValidFunnelPathsRange(funnel, range) &&
      (index === 0 || range.start >= ranges[index - 1].end),
  );

const MORE_NODE = `('', ${kindSql("more")})`;
const DROPPED_NODE = `('', ${kindSql("dropped")})`;

const stepTuple = (end: number): string =>
  `[${Array.from({ length: end }, (_, index) => `toUInt8(step_${index + 1})`).join(", ")}]`;

/**
 * When each actor did each step up to `end`, chained: step k is the first
 * step-k event after step k - 1. `t_k` is the first step-k event at all, which
 * can come before the previous step when the funnel isn't strictly ordered.
 */
const chainCte = (end: number): Cte => ({
  name: "funnel_chain",
  note: "when each actor did each step, each one the first after the step before",
  deps: ["scoped_events"],
  body: [
    "SELECT",
    "  actor,",
    `  arraySort(groupArrayIf((ts, ${stepTuple(end)}), ${Array.from({ length: end }, (_, index) => `step_${index + 1}`).join(" OR ")})) AS step_events,`,
    Array.from({ length: end }, (_, index) =>
      index === 0
        ? "  arrayFirst(e -> e.2[1] = 1, step_events).1 AS c_1"
        : `  arrayFirst(e -> e.2[${index + 1}] = 1 AND e.1 > c_${index}, step_events).1 AS c_${index + 1}`,
    ).join(",\n"),
    "FROM scoped_events",
    "GROUP BY actor",
  ].join("\n"),
});

/** `[expr(range 1), expr(range 2), …]`, read with `[r]` for the row's range. */
const perRange = (
  ranges: readonly FunnelPathsRange[],
  toSql: (range: FunnelPathsRange) => string,
): string => `[${ranges.map(toSql).join(", ")}]`;

/**
 * The paths of the people who reached each range's starting step, until they
 * reached its ending step or, for the rest, until the funnel's window closed.
 * Each link is split by whether its people converted. Every range comes from
 * one pass over the events.
 */
export const planFunnelPaths = (
  spec: AnalysisSpec,
  { ranges, steps, maxNodes, withFirstEvents = false }: FunnelPathsQuery,
): QueryPlan => {
  const funnel = spec.funnel;
  if (funnel?.ordering === "any") {
    return {
      ctes: [],
      select: "SELECT 'Paths need ordered steps' AS message",
      warnings: ["Paths aren't available when steps can happen in any order."],
    };
  }
  if (!funnel || !areValidFunnelPathsRanges(funnel, ranges)) {
    return {
      ctes: [],
      select: "SELECT 'Add at least two steps' AS message",
      warnings: ["The paths need a starting step before their ending step."],
    };
  }

  const lastEnd = ranges[ranges.length - 1].end;
  const window = seconds(funnel.window);
  const outcomes = getOutcomeLabels();
  const moreLabel = t`(More than ${steps} steps)`;
  const stepLabel = (step: number) => lit(funnel.steps[step - 1].label);
  const isConvertedSql = ({ start, end }: FunnelPathsRange) =>
    `l.level >= ${end} AND c.c_${end} > c.c_${start}`;
  const windowStartSql = ({ start }: FunnelPathsRange) =>
    funnel.anchor === "each" ? `c.c_${start}` : "c.c_1";

  // Splitting would give an actor a row per split value.
  const levels = funnelLevels({ ...spec, split: false }, funnel, [
    { as: "step_name", sql: STEP_NAME_SQL },
  ]);

  const ctes: Cte[] = [
    ...levels.ctes,
    chainCte(lastEnd),
    {
      name: "path_bounds",
      note: "each actor who reached a starting step: for each range, whether they reached it and converted, and when its path starts and ends",
      deps: [levels.source, "funnel_chain"],
      body: [
        "SELECT",
        "  l.actor AS actor,",
        `  ${perRange(ranges, ({ start }) => `l.level >= ${start} AND c.c_${start} > 0`)} AS range_reached,`,
        `  ${perRange(ranges, isConvertedSql)} AS range_converted,`,
        `  ${perRange(ranges, ({ start }) => `c.c_${start}`)} AS range_start,`,
        `  ${perRange(ranges, (range) => `if(${isConvertedSql(range)}, c.c_${range.end}, addSeconds(${windowStartSql(range)}, ${window}))`)} AS range_end`,
        `FROM ${levels.source} AS l`,
        "INNER JOIN funnel_chain AS c ON c.actor = l.actor",
        `WHERE l.level >= ${ranges[0].start} AND c.c_${ranges[0].start} > 0`,
      ].join("\n"),
    },
    {
      name: "path_events",
      note: "each actor's events from each range's starting step to its ending step, or to the end of the window — an event on the step where one range ends and the next starts is in both",
      deps: ["scoped_events", "path_bounds"],
      body: [
        "SELECT",
        "  actor,",
        `  r AS ${RANGE_COLUMN},`,
        "  range_converted[r] AS converted,",
        "  ts,",
        "  ts = range_start[r] AND start_flags[r] AS is_start,",
        "  range_converted[r] AND ts = range_end[r] AND end_flags[r] AS is_end,",
        "  multiIf(is_start, 0, is_end, 2, 1) AS tiebreak,",
        `  multiIf(is_start, ${perRange(ranges, ({ start }) => stepLabel(start))}[r], is_end, ${perRange(ranges, ({ end }) => stepLabel(end))}[r], step_name) AS name,`,
        `  if(is_end, ${kindSql("converted")}, ${kindSql("step")}) AS kind,`,
        "  step_name AS raw_name",
        "FROM (",
        "  SELECT",
        "    e.actor AS actor,",
        "    e.ts AS ts,",
        "    e.step_name AS step_name,",
        "    b.range_reached AS range_reached,",
        "    b.range_converted AS range_converted,",
        "    b.range_start AS range_start,",
        "    b.range_end AS range_end,",
        `    ${perRange(ranges, ({ start }) => `e.step_${start} = 1`)} AS start_flags,`,
        `    ${perRange(ranges, ({ end }) => `e.step_${end} = 1`)} AS end_flags`,
        "  FROM scoped_events AS e",
        "  INNER JOIN path_bounds AS b ON b.actor = e.actor",
        ")",
        "ARRAY JOIN arrayFilter(",
        "  r -> range_reached[r]",
        "    AND ts <= range_end[r]",
        "    AND (ts > range_start[r] OR (ts = range_start[r] AND start_flags[r]))",
        "    AND (ts < range_end[r] OR (ts = range_end[r] AND end_flags[r]) OR NOT range_converted[r]),",
        `  range(1, ${ranges.length + 1})`,
        ") AS r",
      ].join("\n"),
    },
    {
      name: "path_sequences",
      note: "each actor's events in order for each range, with consecutive repeats of the same event merged — the funnel steps are named by their step, so repeats compare the event's own name",
      deps: ["path_events"],
      body: [
        "SELECT",
        "  actor,",
        `  ${RANGE_COLUMN},`,
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
        `GROUP BY actor, ${RANGE_COLUMN}`,
      ].join("\n"),
    },
    {
      name: "funnel_paths",
      note: `each actor's path for each range: the first ${steps} steps after the starting one, then the ending step or a drop-off, and the first thing they did that wasn't a funnel step`,
      deps: ["path_sequences"],
      body: [
        "SELECT",
        "  actor,",
        `  ${RANGE_COLUMN},`,
        "  converted,",
        `  if(length(nodes) >= 2 AND nodes[2].2 = ${kindSql("step")}, nodes[2].1, '') AS path_first_event,`,
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
        `  ${RANGE_COLUMN},`,
        "  converted,",
        "  if(position = 1, path_first_event, '') AS path_first_event,",
        "  position,",
        "  node.1 AS name,",
        "  node.2 AS kind",
        "FROM funnel_paths",
        "ARRAY JOIN path AS node, arrayEnumerate(path) AS position",
      ].join("\n"),
    },
    {
      name: "kept_nodes",
      note: `the ${maxNodes} most common events at each step of each range — the rest are grouped into Other`,
      deps: ["path_positions"],
      body: [
        `SELECT ${RANGE_COLUMN}, position, name`,
        "FROM path_positions",
        `WHERE kind = ${kindSql("step")}`,
        `GROUP BY ${RANGE_COLUMN}, position, name`,
        `ORDER BY ${RANGE_COLUMN}, position, count() DESC, name`,
        `LIMIT ${maxNodes} BY ${RANGE_COLUMN}, position`,
      ].join("\n"),
    },
    {
      name: "grouped_nodes",
      note: "each path's nodes, with the events too small to show grouped into Other",
      deps: ["path_positions", "kept_nodes"],
      body: [
        "SELECT",
        "  actor,",
        `  ${RANGE_COLUMN},`,
        "  converted,",
        "  path_first_event,",
        "  position,",
        "  if(is_other, '', name) AS name,",
        `  if(is_other, ${kindSql("other")}, kind) AS kind`,
        "FROM (",
        "  SELECT",
        "    *,",
        `    kind = ${kindSql("step")} AND (${RANGE_COLUMN}, position, name) NOT IN (SELECT ${RANGE_COLUMN}, position, name FROM kept_nodes) AS is_other`,
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
        `  ${RANGE_COLUMN},`,
        "  position AS step,",
        // Not nullable, so a grouping set leaves them '' rather than NULL.
        `  ifNull(${pathNodeKeySql("position", "kind", "name")}, '') AS source,`,
        `  ifNull(${pathNodeKeySql("position + 1", "next_kind", "next_name")}, '') AS target,`,
        `  ifNull(${pathNodeLabelSql("kind", "name", moreLabel)}, '') AS ${PATHS_COLUMNS.sourceLabel},`,
        `  ifNull(${pathNodeLabelSql("next_kind", "next_name", moreLabel)}, '') AS ${PATHS_COLUMNS.targetLabel},`,
        `  next_kind AS ${PATHS_COLUMNS.targetKind},`,
        "  converted,",
        `  ifNull(path_first_event, '') AS ${FIRST_EVENT_COLUMN},`,
        "  actor",
        "FROM (",
        "  SELECT",
        "    actor,",
        `    ${RANGE_COLUMN},`,
        "    converted,",
        "    path_first_event,",
        "    position,",
        "    name,",
        "    kind,",
        `    leadInFrame(name, 1, '') OVER (PARTITION BY actor, ${RANGE_COLUMN} ORDER BY position`,
        "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_name,",
        `    leadInFrame(kind, 1, '') OVER (PARTITION BY actor, ${RANGE_COLUMN} ORDER BY position`,
        "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_kind",
        "  FROM grouped_nodes",
        ")",
        "WHERE next_kind != ''",
      ].join("\n"),
    },
  ];

  const edgeKeys = [
    RANGE_COLUMN,
    "step",
    "source",
    "target",
    PATHS_COLUMNS.sourceLabel,
    PATHS_COLUMNS.targetLabel,
    PATHS_COLUMNS.targetKind,
    "converted",
  ].join(", ");
  // Each actor's first link carries their first event, so a second grouping
  // set counts people by it without another pass. Outside a grouping set,
  // columns come back as '', which no node key is.
  const groupBy = withFirstEvents
    ? [
        `GROUP BY GROUPING SETS ((${edgeKeys}), (${RANGE_COLUMN}, ${FIRST_EVENT_COLUMN}))`,
        `HAVING source != '' OR ${FIRST_EVENT_COLUMN} != ''`,
      ]
    : [`GROUP BY ${edgeKeys}`];

  return {
    ctes,
    select: [
      "SELECT",
      `  ${RANGE_COLUMN},`,
      "  step,",
      "  source,",
      "  target,",
      `  ${PATHS_COLUMNS.sourceLabel},`,
      `  ${PATHS_COLUMNS.targetLabel},`,
      `  ${PATHS_COLUMNS.targetKind},`,
      `  if(converted, ${lit(outcomes.converted)}, ${lit(outcomes.notConverted)}) AS ${OUTCOME_COLUMN},`,
      ...(withFirstEvents ? [`  ${FIRST_EVENT_COLUMN},`] : []),
      "  count() AS weight" + (withFirstEvents ? "," : ""),
      ...(withFirstEvents
        ? [`  countIf(converted) AS ${CONVERTED_WEIGHT_COLUMN}`]
        : []),
      "FROM edges",
      ...groupBy,
      `ORDER BY ${RANGE_COLUMN}, step, converted DESC, weight DESC`,
    ].join("\n"),
    warnings: [
      ...levels.warnings,
      `Steps between the funnel steps are named by ${lit("event_name")}, falling back to ${lit("url_path")}.`,
    ],
  };
};
