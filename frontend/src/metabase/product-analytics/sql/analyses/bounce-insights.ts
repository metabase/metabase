import type { AnalysisSpec } from "../../spec/types";

import {
  type AttributeAsOfRules,
  type InsightPopulation,
  attributeAsOfSql,
  attributeSql,
} from "./insights";
import { VISIT_LENGTHS_CTE, canShowBounces } from "./path-steps";
import { pathWindowCtes } from "./paths";

/** Insights look at this many of the most common landing pages. */
export const MAX_LANDING_PAGES = 5;

/**
 * Paths' insight population, `landing_visits`: one row per visit that landed
 * on one of the most common landing pages. Question k is the k-th most common,
 * labeled with its name, and a visit converts when it bounces. Attributes are
 * as of landing: the value on the landing step's event, since a value from
 * later in the visit would leak its outcome, and one from an earlier visit
 * (like its UTM tags) describes that visit instead. Undefined unless the paths
 * cover every visit from its first step.
 */
export const bounceInsightPopulation = (
  spec: AnalysisSpec,
  attributes: readonly string[],
  asOf: AttributeAsOfRules,
): InsightPopulation | undefined => {
  const paths = spec.paths;
  if (paths === undefined || !canShowBounces(paths)) {
    return undefined;
  }
  const ids = attributes.map(attributeSql);
  const window = pathWindowCtes(
    spec,
    paths,
    ids.map((id) => ({ as: `${id}_v`, sql: attributeAsOfSql(asOf, id).value })),
  );

  const landings = {
    name: "landings",
    note: "each visit's first step, whether it was the visit's only one, and each attribute's value on it",
    deps: ["ordered_steps", VISIT_LENGTHS_CTE.name],
    body: [
      "SELECT",
      "  s.actor AS actor,",
      "  s.visit AS visit,",
      "  s.step_name AS step_name,",
      "  l.visit_length = 1 AS bounced" + (ids.length > 0 ? "," : ""),
      ids.map((id) => `  s.${id}_v AS ${id}_v`).join(",\n"),
      "FROM ordered_steps AS s",
      "INNER JOIN visit_lengths AS l ON l.actor = s.actor AND l.visit = s.visit",
      "WHERE s.position = 1",
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const landingPages = {
    name: "landing_pages",
    note: `the ${MAX_LANDING_PAGES} most common landing pages, numbered from the most common`,
    deps: ["landings"],
    body: [
      "SELECT step_name, k",
      "FROM (",
      "  SELECT",
      "    step_name,",
      "    toInt64(row_number() OVER (ORDER BY entrances DESC, step_name)) AS k",
      "  FROM (",
      "    SELECT step_name, count() AS entrances",
      "    FROM landings",
      "    GROUP BY step_name",
      "  )",
      ")",
      `WHERE k <= ${MAX_LANDING_PAGES}`,
    ].join("\n"),
  };
  const landingVisits = {
    name: "landing_visits",
    note: "one row per visit that landed on one of those pages: whether it bounced, and each attribute as of landing",
    deps: ["landings", "landing_pages"],
    body: [
      "SELECT",
      "  l.actor AS actor,",
      "  p.k AS k,",
      "  p.step_name AS label,",
      "  l.bounced AS converted" + (ids.length > 0 ? "," : ""),
      ids
        .map(
          (id) =>
            `  if(l.${id}_v != '', l.${id}_v, ${attributeAsOfSql(asOf, id).fallback}) AS ${id}`,
        )
        .join(",\n"),
      "FROM landings AS l",
      "INNER JOIN landing_pages AS p ON p.step_name = l.step_name",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  return {
    ctes: [
      ...window.ctes,
      VISIT_LENGTHS_CTE,
      landings,
      landingPages,
      landingVisits,
    ],
    source: landingVisits.name,
    hasLabels: true,
    warnings: window.warnings,
  };
};
