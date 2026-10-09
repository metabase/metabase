import type { AnalysisSpec } from "../../spec/types";
import { lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

import { scopedEvents } from "./base";

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

  const anchor =
    paths.direction === "to"
      ? flagSql(paths.end.flag)
      : flagSql(paths.start.flag);

  const stepName =
    "if(event_name != '' AND event_name IS NOT NULL, event_name, url_path)";

  const base = scopedEvents(spec, undefined, [
    { as: "is_step", sql: `(${isStep})` },
    { as: "is_anchor", sql: anchor },
    { as: "step_name", sql: stepName },
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
      "  is_anchor,",
      "  sum(new_visit) OVER (PARTITION BY actor ORDER BY ts",
      "    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS visit",
      "FROM (",
      "  SELECT",
      "    actor,",
      "    ts,",
      "    step_name,",
      "    is_anchor,",
      "    if(row_number() OVER (PARTITION BY actor ORDER BY ts) = 1",
      `       OR dateDiff('second', lagInFrame(ts, 1, ts) OVER (PARTITION BY actor ORDER BY ts`,
      "         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), ts) > " +
        `${gap},`,
      "       1, 0) AS new_visit",
      "  FROM scoped_events",
      "  WHERE is_step OR is_anchor",
      ")",
    ].join("\n"),
  });

  const dedupe = paths.mergeRepeats || paths.collapseNoise;
  ctes.push({
    name: "ordered_steps",
    note: dedupe
      ? "steps in order within each visit, with consecutive repeats merged"
      : "steps in order within each visit",
    deps: ["visits"],
    body: [
      "SELECT",
      "  actor,",
      "  visit,",
      "  ts,",
      "  step_name,",
      "  is_anchor,",
      "  row_number() OVER (PARTITION BY actor, visit ORDER BY ts) AS position",
      "FROM (",
      "  SELECT",
      "    actor, visit, ts, step_name, is_anchor,",
      "    lagInFrame(step_name, 1, '') OVER (PARTITION BY actor, visit ORDER BY ts",
      "      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_name",
      "  FROM visits",
      ")",
      dedupe ? "WHERE previous_name = '' OR previous_name != step_name" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  ctes.push({
    name: "anchored",
    note:
      paths.direction === "to"
        ? "each visit's steps, numbered backwards from the anchor"
        : "each visit's steps, numbered forwards from the anchor",
    deps: ["ordered_steps"],
    body: [
      "SELECT actor, visit, step_name, hop",
      "FROM (",
      "  SELECT",
      "    s.actor AS actor,",
      "    s.visit AS visit,",
      "    s.step_name AS step_name,",
      paths.direction === "to"
        ? "    a.position - s.position AS hop"
        : "    s.position - a.position AS hop",
      "  FROM ordered_steps AS s",
      "  INNER JOIN (",
      "    SELECT actor, visit, min(position) AS position",
      "    FROM ordered_steps",
      "    WHERE is_anchor",
      "    GROUP BY actor, visit",
      "  ) AS a ON a.actor = s.actor AND a.visit = s.visit",
      ")",
      `WHERE hop BETWEEN 0 AND ${depth}`,
    ].join("\n"),
  });

  ctes.push({
    name: "edges",
    note: "one row per hop, from each step to the next",
    deps: ["anchored"],
    body: [
      "SELECT",
      "  hop,",
      "  step_name AS source,",
      "  leadInFrame(step_name, 1, '') OVER (PARTITION BY actor, visit ORDER BY hop",
      "    ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS target,",
      "  actor",
      "FROM anchored",
    ].join("\n"),
  });

  const metric =
    spec.output.pathsEdgeMetric === "events"
      ? "count() AS weight"
      : "uniqExact(actor) AS weight";

  return {
    ctes,
    select: [
      "SELECT",
      "  hop,",
      "  source,",
      "  target,",
      `  ${metric}`,
      "FROM edges",
      "WHERE target IS NOT NULL AND target != ''",
      "GROUP BY hop, source, target",
      `HAVING weight >= ${paths.minVolume}`,
      "ORDER BY hop, weight DESC",
      `LIMIT ${paths.maxNodes} BY hop`,
    ].join("\n"),
    warnings: [
      ...warnings,
      `Steps are named by ${lit("event_name")}, falling back to ${lit("url_path")} — two different events sharing a name collapse into one node.`,
      "Visits are re-derived here from the gap setting rather than using session_id or visit_id.",
    ],
  };
};
