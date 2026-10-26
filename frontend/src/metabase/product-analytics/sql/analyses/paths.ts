import type { AnalysisSpec, PathsSpec, PathsVisit } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte, DrillPoint, QueryPlan } from "../compose";

import { SESSION_EXTRA_COLUMN, pointString, scopedEvents } from "./base";
import {
  BREAKOUT_COLUMN,
  breakoutDrillCondition,
  breakoutGroupBy,
  breakoutSelect,
  withBreakout,
} from "./breakout";
import {
  PATHS_COLUMNS,
  kindSql,
  pathNodeKeySql,
  pathNodeLabelSql,
  stepNameSql,
} from "./path-nodes";

// A step is noisy when it makes up at least this share of all steps...
const NOISY_SHARE = 0.2;
// ...and at least this many times an even split, so a short list of steps
// isn't all noise.
const NOISY_FAIR_SHARE_MULTIPLE = 3;

/** Where a path's window starts and ends, in words, for the SQL notes. */
const getBoundsNote = ({ direction, start, end }: PathsSpec): string => {
  const starting =
    start !== null ? "the first starting event" : "the first step of the visit";
  const ending =
    end === null
      ? "the last step of the visit"
      : direction === "between"
        ? "the next ending event"
        : "the first ending event";
  switch (direction) {
    case "from":
      return `the window of steps in each visit, starting at ${starting}`;
    case "to":
      return `the window of steps in each visit, ending at ${ending}`;
    case "between":
      return `the window of steps in each visit, from ${starting} to ${ending}`;
  }
};

/**
 * Each visit's window. Without a starting event, it starts at the visit's
 * first step, and without an ending event, it ends at the visit's last.
 */
const getBoundsBody = (
  { direction, start, end }: PathsSpec,
  depth: number,
): string[] => {
  const endsAt = end !== null ? "min" : "max";
  switch (direction) {
    case "from":
      return [
        "SELECT",
        "  actor,",
        "  visit,",
        "  toInt64(min(position)) AS first_position,",
        `  first_position + ${depth} AS last_position`,
        "FROM ordered_steps",
        start !== null ? "WHERE is_start" : "",
        "GROUP BY actor, visit",
      ];
    case "to":
      // first_position can go below 1 so the ending event always lands on the
      // same step number, however many steps a visit had before it
      return [
        "SELECT",
        "  actor,",
        "  visit,",
        `  toInt64(${endsAt}(position)) AS last_position,`,
        `  last_position - ${depth} AS first_position`,
        "FROM ordered_steps",
        end !== null ? "WHERE is_end" : "",
        "GROUP BY actor, visit",
      ];
    case "between":
      return [
        "SELECT",
        "  o.actor AS actor,",
        "  o.visit AS visit,",
        "  any(starts.first_position) AS first_position,",
        `  toInt64(${endsAt}(o.position)) AS last_position`,
        "FROM ordered_steps AS o",
        "INNER JOIN (",
        "  SELECT actor, visit, toInt64(min(position)) AS first_position",
        "  FROM ordered_steps",
        start !== null ? "  WHERE is_start" : "",
        "  GROUP BY actor, visit",
        ") AS starts ON starts.actor = o.actor AND starts.visit = o.visit",
        `WHERE ${end !== null ? "o.is_end AND " : ""}o.position > starts.first_position`,
        "GROUP BY o.actor, o.visit",
        `HAVING last_position - first_position <= ${depth}`,
      ];
  }
};

const VISIT_COLUMNS = [
  "  actor,",
  "  ts,",
  "  step_name,",
  "  is_start,",
  "  is_end,",
];
const PATH_EVENTS_WHERE = "WHERE is_step OR is_start OR is_end";

/** Tags `scoped_events` with the visit each event is in, as `visit`. */
const visitsCte = (spec: AnalysisSpec, visit: PathsVisit): Cte => {
  if (visit.kind === "session") {
    const isSessionActor = spec.grain === "session";
    return {
      name: "visits",
      note: isSessionActor
        ? "each session's events, as one visit"
        : "each event tagged with its session as the visit",
      deps: ["scoped_events"],
      body: [
        "SELECT",
        ...VISIT_COLUMNS,
        `  ${isSessionActor ? "0" : "session"} AS visit`,
        "FROM scoped_events",
        PATH_EVENTS_WHERE,
      ].join("\n"),
    };
  }
  const indent = (line: string) => `  ${line}`;
  return {
    name: "visits",
    note: `each event tagged with a visit — a break longer than ${visit.gap.value} ${visit.gap.unit}s starts a new one`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      ...VISIT_COLUMNS,
      "  sum(new_visit) OVER (PARTITION BY actor ORDER BY ts",
      "    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS visit",
      "FROM (",
      "  SELECT",
      ...VISIT_COLUMNS.map(indent),
      "    if(row_number() OVER (PARTITION BY actor ORDER BY ts) = 1",
      `       OR dateDiff('second', lagInFrame(ts, 1, ts) OVER (PARTITION BY actor ORDER BY ts`,
      `         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), ts) > ${seconds(visit.gap)},`,
      "       1, 0) AS new_visit",
      "  FROM scoped_events",
      indent(PATH_EVENTS_WHERE),
      ")",
    ].join("\n"),
  };
};

/** The steps a path shows after its first, at most. */
export const getPathDepth = (paths: PathsSpec): number =>
  Math.min(paths.steps, 8);

/**
 * Each visit's steps in order as `ordered_steps`, and the window of them the
 * paths cover as `bounds`.
 */
const pathWindowCtes = (
  spec: AnalysisSpec,
  paths: PathsSpec,
): { ctes: Cte[]; warnings: string[] } => {
  const warnings: string[] = [];

  const isStep = paths.included.length
    ? paths.included.map((ref) => flagSql(ref.flag)).join("\n     OR ")
    : "1";

  const start = paths.direction !== "to" ? paths.start : null;
  const end = paths.direction !== "from" ? paths.end : null;

  const base = scopedEvents(spec, undefined, [
    { as: "is_step", sql: `(${isStep})` },
    { as: "is_start", sql: start !== null ? flagSql(start.flag) : "0" },
    { as: "is_end", sql: end !== null ? flagSql(end.flag) : "0" },
    { as: "step_name", sql: stepNameSql(spec) },
    ...(paths.visit.kind === "session" && spec.grain !== "session"
      ? [SESSION_EXTRA_COLUMN]
      : []),
  ]);
  warnings.push(...base.warnings);

  const ctes: Cte[] = [...base.ctes];

  ctes.push(visitsCte(spec, paths.visit));

  if (paths.hideNoisyEvents) {
    ctes.push({
      name: "noisy_steps",
      note: `steps that fire so often they drown out the rest — at least ${NOISY_SHARE * 100}% of all steps`,
      deps: ["visits"],
      body: [
        "SELECT step_name",
        "FROM (",
        "  SELECT",
        "    step_name,",
        "    count() / sum(count()) OVER () AS share,",
        "    count() OVER () AS step_names",
        "  FROM visits",
        "  GROUP BY step_name",
        ")",
        `WHERE share >= greatest(${NOISY_SHARE}, ${NOISY_FAIR_SHARE_MULTIPLE} / step_names)`,
      ].join("\n"),
    });
    warnings.push(
      "Noisy events are hidden, except where they are the starting or ending event.",
    );
  }

  const dedupe = paths.mergeRepeats;
  ctes.push({
    name: "ordered_steps",
    note: dedupe
      ? "steps in order within each visit, with consecutive repeats merged"
      : "steps in order within each visit",
    deps: paths.hideNoisyEvents ? ["visits", "noisy_steps"] : ["visits"],
    body: [
      "SELECT",
      "  actor,",
      "  visit,",
      "  ts,",
      "  step_name,",
      "  is_start,",
      "  is_end,",
      "  row_number() OVER (PARTITION BY actor, visit ORDER BY ts) AS position",
      "FROM (",
      "  SELECT",
      "    actor, visit, ts, step_name, is_start, is_end,",
      "    lagInFrame(step_name, 1, '') OVER (PARTITION BY actor, visit ORDER BY ts",
      "      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_name",
      "  FROM visits",
      paths.hideNoisyEvents
        ? "  WHERE is_start OR is_end OR step_name NOT IN (SELECT step_name FROM noisy_steps)"
        : "",
      ")",
      dedupe ? "WHERE previous_name = '' OR previous_name != step_name" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  ctes.push({
    name: "bounds",
    note: getBoundsNote({ ...paths, start, end }),
    deps: ["ordered_steps"],
    body: getBoundsBody({ ...paths, start, end }, getPathDepth(paths))
      .filter(Boolean)
      .join("\n"),
  });

  return { ctes, warnings };
};

export const planPaths = (spec: AnalysisSpec): QueryPlan => {
  const paths = spec.paths;
  if (!paths) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const depth = getPathDepth(paths);
  const window = pathWindowCtes(spec, paths);
  const warnings = [...window.warnings];
  const ctes = [...window.ctes];

  ctes.push({
    name: "numbered",
    note: "each visit's steps inside its window, numbered from 1 in time order",
    deps: ["ordered_steps", "bounds"],
    body: [
      "SELECT",
      "  s.actor AS actor,",
      "  s.visit AS visit,",
      "  s.step_name AS step_name,",
      "  toInt64(s.position) - b.first_position + 1 AS step",
      "FROM ordered_steps AS s",
      "INNER JOIN bounds AS b ON b.actor = s.actor AND b.visit = s.visit",
      "WHERE s.position BETWEEN b.first_position AND b.last_position",
    ].join("\n"),
  });

  // `numbered` has a row per visit per step, so counting sessions counts
  // visits: each is one path, and a node's flows add up to it.
  const volume = spec.grain === "session" ? "count()" : "uniqExact(actor)";

  ctes.push({
    name: "kept_steps",
    note: `the ${paths.maxNodes} biggest events at each step, with at least ${paths.minVolume} — the rest are grouped into Other`,
    deps: ["numbered"],
    body: [
      "SELECT step, step_name",
      "FROM numbered",
      "GROUP BY step, step_name",
      `HAVING ${volume} >= ${paths.minVolume}`,
      `ORDER BY step, ${volume} DESC, step_name`,
      `LIMIT ${paths.maxNodes} BY step`,
    ].join("\n"),
  });

  ctes.push({
    name: "grouped_steps",
    note: "each visit's steps, with the events too small to show grouped into Other",
    deps: ["numbered", "kept_steps"],
    body: [
      "SELECT",
      "  actor,",
      "  visit,",
      "  step,",
      "  if(is_kept, step_name, '') AS step_name,",
      `  if(is_kept, ${kindSql("step")}, ${kindSql("other")}) AS kind`,
      "FROM (",
      "  SELECT",
      "    *,",
      "    (step, step_name) IN (SELECT step, step_name FROM kept_steps) AS is_kept",
      "  FROM numbered",
      ")",
    ].join("\n"),
  });

  // Only "from" has paths that can end early; the others end at their ending event.
  const dropOff = paths.direction === "from" ? ` OR step <= ${depth}` : "";
  ctes.push({
    name: "edges",
    note: "one row per step, from each step to the next — keys carry the step number so a repeated step is a new node, not a loop",
    deps: ["grouped_steps"],
    body: [
      "SELECT",
      "  step,",
      `  ${pathNodeKeySql("step", "kind", "step_name")} AS source,`,
      `  ${pathNodeKeySql("step + 1", "target_kind", "next_name")} AS target,`,
      `  ${pathNodeLabelSql("kind", "step_name")} AS ${PATHS_COLUMNS.sourceLabel},`,
      `  ${pathNodeLabelSql("target_kind", "next_name")} AS ${PATHS_COLUMNS.targetLabel},`,
      `  target_kind AS ${PATHS_COLUMNS.targetKind},`,
      "  actor",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    step,",
      "    step_name,",
      "    kind,",
      "    leadInFrame(step_name, 1, '') OVER (PARTITION BY actor, visit ORDER BY step",
      "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_name,",
      "    leadInFrame(kind, 1, '') OVER (PARTITION BY actor, visit ORDER BY step",
      "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_kind,",
      `    if(next_kind = '', ${kindSql("dropped")}, next_kind) AS target_kind`,
      "  FROM grouped_steps",
      ")",
      `WHERE next_kind != ''${dropOff}`,
    ].join("\n"),
  });

  // A node click carries one label, an edge click both ends.
  const members = (point: DrillPoint): string | null => {
    const source = pointString(point.source);
    const target = pointString(point.target);
    const inGroup = breakoutDrillCondition(spec, point[BREAKOUT_COLUMN]);
    if (source !== null && target !== null) {
      return `SELECT DISTINCT actor FROM edges\nWHERE source = ${lit(source)} AND target = ${lit(target)}${inGroup}`;
    }
    const node = source ?? target;
    return node === null
      ? null
      : `SELECT DISTINCT actor FROM edges\nWHERE (source = ${lit(node)} OR target = ${lit(node)})${inGroup}`;
  };

  return {
    members,
    ctes,
    select: [
      "SELECT",
      "  step,",
      "  source,",
      "  target,",
      `  ${PATHS_COLUMNS.sourceLabel},`,
      `  ${PATHS_COLUMNS.targetLabel},`,
      `  ${PATHS_COLUMNS.targetKind},`,
      ...breakoutSelect(spec),
      `  ${volume} AS weight`,
      // The nodes are picked from everyone's steps, so each group's links
      // share them.
      `FROM ${withBreakout(spec, "edges")}`,
      `GROUP BY ${breakoutGroupBy(spec)}step, source, target, ${PATHS_COLUMNS.sourceLabel}, ${PATHS_COLUMNS.targetLabel}, ${PATHS_COLUMNS.targetKind}`,
      "ORDER BY step, weight DESC",
    ].join("\n"),
    warnings,
  };
};
