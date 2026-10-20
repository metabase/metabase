import type { AnalysisSpec, PathsSpec } from "../../spec/types";
import type { QueryPlan } from "../compose";

import { pathWindowCtes } from "./paths";

/** The columns the steps query returns. */
export const PATH_STEPS_COLUMNS = {
  name: "step_name",
  entrances: "entrances",
  bounces: "bounces",
  visits: "visits",
  exits: "exits",
} as const;

const MAX_STEPS = 100;

/**
 * Whether a path's window can start at the first step of a visit, so that
 * steps in it can be entrances. A window that starts at a starting event
 * can't: only that event could be the visit's first step.
 */
export const canShowEntrances = (paths: PathsSpec): boolean =>
  paths.direction === "to" || paths.start === null;

/**
 * Whether a path's window can end at the last step of a visit, so that steps
 * in it can be exits. A window that ends at an ending event can't: only that
 * event could be the visit's last step.
 */
export const canShowExits = (paths: PathsSpec): boolean =>
  paths.direction === "from" || paths.end === null;

/**
 * Each step that appears in the paths' windows, wherever in them it appears:
 * how many visits reached it, started with it, ended with it, and started
 * with it and did nothing else. Exits and bounces are the visit's real end,
 * not the end of its window.
 */
export const planPathSteps = (spec: AnalysisSpec): QueryPlan => {
  const paths = spec.paths;
  if (!paths) {
    return { ctes: [], select: "SELECT 1", warnings: [] };
  }

  const window = pathWindowCtes(spec, paths);
  const visit = "(actor, visit)";
  const { name, entrances, bounces, visits, exits } = PATH_STEPS_COLUMNS;

  return {
    ctes: [
      ...window.ctes,
      {
        name: "visit_lengths",
        note: "how many steps each visit had",
        deps: ["ordered_steps"],
        body: [
          "SELECT actor, visit, max(position) AS visit_length",
          "FROM ordered_steps",
          "GROUP BY actor, visit",
        ].join("\n"),
      },
      {
        name: "window_steps",
        note: "each visit's steps inside its window, with the visit's length",
        deps: ["ordered_steps", "bounds", "visit_lengths"],
        body: [
          "SELECT",
          "  s.actor AS actor,",
          "  s.visit AS visit,",
          "  s.step_name AS step_name,",
          "  s.position AS position,",
          "  l.visit_length AS visit_length",
          "FROM ordered_steps AS s",
          "INNER JOIN bounds AS b ON b.actor = s.actor AND b.visit = s.visit",
          "INNER JOIN visit_lengths AS l ON l.actor = s.actor AND l.visit = s.visit",
          "WHERE s.position BETWEEN b.first_position AND b.last_position",
        ].join("\n"),
      },
    ],
    select: [
      "SELECT",
      `  step_name AS ${name},`,
      `  uniqExactIf(${visit}, position = 1) AS ${entrances},`,
      `  uniqExactIf(${visit}, position = 1 AND visit_length = 1) AS ${bounces},`,
      `  uniqExact(${visit}) AS ${visits},`,
      `  uniqExactIf(${visit}, position = visit_length) AS ${exits}`,
      "FROM window_steps",
      "GROUP BY step_name",
      `ORDER BY ${visits} DESC, step_name`,
      `LIMIT ${MAX_STEPS}`,
    ].join("\n"),
    warnings: window.warnings,
  };
};
