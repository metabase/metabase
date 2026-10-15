import type { AnalysisSpec, PathsSpec } from "../../spec/types";
import { lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte, DrillPoint, QueryPlan } from "../compose";

import { pointString, scopedEvents } from "./base";

const STEP_NAME_SQL =
  "if(event_name != '' AND event_name IS NOT NULL, event_name, url_path)";

// A step is noisy when it makes up at least this share of all steps...
const NOISY_SHARE = 0.2;
// ...and at least this many times an even split, so a short list of steps
// isn't all noise.
const NOISY_FAIR_SHARE_MULTIPLE = 3;

const BOUNDS_NOTES: Record<PathsSpec["direction"], string> = {
  from: "the window of steps in each visit, starting at the first starting event",
  to: "the window of steps in each visit, ending at the first ending event",
  between:
    "the window of steps in each visit, from the first starting event to the next ending event",
};

const getBoundsBody = (
  direction: PathsSpec["direction"],
  depth: number,
): string[] => {
  switch (direction) {
    case "from":
      return [
        "SELECT",
        "  actor,",
        "  visit,",
        "  toInt64(min(position)) AS first_position,",
        `  first_position + ${depth} AS last_position`,
        "FROM ordered_steps",
        "WHERE is_start",
        "GROUP BY actor, visit",
      ];
    case "to":
      // first_position can go below 1 so the ending event always lands on the
      // same step number, however many steps a visit had before it
      return [
        "SELECT",
        "  actor,",
        "  visit,",
        "  toInt64(min(position)) AS last_position,",
        `  last_position - ${depth} AS first_position`,
        "FROM ordered_steps",
        "WHERE is_end",
        "GROUP BY actor, visit",
      ];
    case "between":
      return [
        "SELECT",
        "  o.actor AS actor,",
        "  o.visit AS visit,",
        "  any(starts.first_position) AS first_position,",
        "  toInt64(min(o.position)) AS last_position",
        "FROM ordered_steps AS o",
        "INNER JOIN (",
        "  SELECT actor, visit, toInt64(min(position)) AS first_position",
        "  FROM ordered_steps",
        "  WHERE is_start",
        "  GROUP BY actor, visit",
        ") AS starts ON starts.actor = o.actor AND starts.visit = o.visit",
        "WHERE o.is_end AND o.position > starts.first_position",
        "GROUP BY o.actor, o.visit",
        `HAVING last_position - first_position <= ${depth}`,
      ];
  }
};

export const planPaths = (spec: AnalysisSpec): QueryPlan => {
  const paths = spec.paths;
  if (!paths) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const warnings: string[] = [];
  const gap = paths.sessionGapMinutes * 60;
  const depth = Math.min(paths.steps, 8);

  const isStep = paths.included.length
    ? paths.included.map((ref) => flagSql(ref.flag)).join("\n     OR ")
    : "1";

  const start = paths.direction !== "to" ? paths.start : null;
  const end = paths.direction !== "from" ? paths.end : null;

  const base = scopedEvents(spec, undefined, [
    { as: "is_step", sql: `(${isStep})` },
    { as: "is_start", sql: start !== null ? flagSql(start.flag) : "0" },
    { as: "is_end", sql: end !== null ? flagSql(end.flag) : "0" },
    { as: "step_name", sql: STEP_NAME_SQL },
  ]);
  warnings.push(...base.warnings);

  const ctes: Cte[] = [...base.ctes];

  ctes.push({
    name: "visits",
    note: `each event tagged with a visit — a gap longer than ${paths.sessionGapMinutes} minutes starts a new one`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      "  ts,",
      "  step_name,",
      "  is_start,",
      "  is_end,",
      "  sum(new_visit) OVER (PARTITION BY actor ORDER BY ts",
      "    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS visit",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    ts,",
      "    step_name,",
      "    is_start,",
      "    is_end,",
      "    if(row_number() OVER (PARTITION BY actor ORDER BY ts) = 1",
      `       OR dateDiff('second', lagInFrame(ts, 1, ts) OVER (PARTITION BY actor ORDER BY ts`,
      "         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), ts) > " +
        `${gap},`,
      "       1, 0) AS new_visit",
      "  FROM scoped_events",
      "  WHERE is_step OR is_start OR is_end",
      ")",
    ].join("\n"),
  });

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
    note: BOUNDS_NOTES[paths.direction],
    deps: ["ordered_steps"],
    body: getBoundsBody(paths.direction, depth).join("\n"),
  });

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

  ctes.push({
    name: "edges",
    note: "one row per step, from each step to the next — labels carry the step number so a repeated step is a new node, not a loop",
    deps: ["numbered"],
    body: [
      "SELECT",
      "  step,",
      "  concat(toString(step), '. ', step_name) AS source,",
      "  concat(toString(step + 1), '. ', next_name) AS target,",
      "  actor",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    step,",
      "    step_name,",
      "    leadInFrame(step_name, 1, '') OVER (PARTITION BY actor, visit ORDER BY step",
      "      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_name",
      "  FROM numbered",
      ")",
      "WHERE next_name != ''",
    ].join("\n"),
  });

  const metric =
    spec.output.pathsEdgeMetric === "events"
      ? "count() AS weight"
      : "uniqExact(actor) AS weight";

  // A node click carries one label, an edge click both ends.
  const members = (point: DrillPoint): string | null => {
    const source = pointString(point.source);
    const target = pointString(point.target);
    if (source !== null && target !== null) {
      return `SELECT DISTINCT actor FROM edges\nWHERE source = ${lit(source)} AND target = ${lit(target)}`;
    }
    const node = source ?? target;
    return node === null
      ? null
      : `SELECT DISTINCT actor FROM edges\nWHERE source = ${lit(node)} OR target = ${lit(node)}`;
  };

  return {
    members,
    ctes,
    select: [
      "SELECT",
      "  step,",
      "  source,",
      "  target,",
      `  ${metric}`,
      "FROM edges",
      "GROUP BY step, source, target",
      `HAVING weight >= ${paths.minVolume}`,
      "ORDER BY step, weight DESC",
      `LIMIT ${paths.maxNodes} BY step`,
    ].join("\n"),
    warnings: [
      ...warnings,
      `Steps are named by ${lit("event_name")}, falling back to ${lit("url_path")} — two different events sharing a name collapse into one node.`,
      "Visits are re-derived here from the gap setting rather than using session_id or visit_id.",
    ],
  };
};
