import { ident, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte, QueryPlan } from "../compose";

/** The value an attribute has in a population when it wasn't seen in time. */
export const NOT_SET_VALUE = "(not set)";
/**
 * The value pass 2 gives the values it doesn't keep, and the explore query the
 * segments too small to report. Pass 2 never returns it.
 */
export const OTHER_VALUE = "(other)";
/** Joins the values of an explore segment over several attributes. */
export const SEGMENT_SEPARATOR = " · ";
/** The singles query's column naming each question, when the population has one. */
export const QUESTION_LABEL_COLUMN = "question_label";

/**
 * How an attribute's value is taken as of a question's moment, like reaching
 * a funnel step or landing on a page.
 *
 * - `first-seen`: the first non-empty value seen by then, or `NOT_SET_VALUE`.
 *   For event properties, which are often only on some events.
 * - `true-by-step`: `"true"` if it was true on any event by then, otherwise
 *   `"false"`. For flags that only go from false to true, like whether the
 *   person was identified. Under `first-seen`, an early false would stick.
 *
 * A rule for "the value on step k's event" would fit here too: it's the
 * latest value of a person trait as of the step, and PostHog's specific-step
 * attribution for breakouts.
 */
export type AttributeAsOf = "first-seen" | "true-by-step";

/** Each attribute's rule, by id. Attributes not in it are `first-seen`. */
export type AttributeAsOfRules = ReadonlyMap<string, AttributeAsOf>;

/**
 * Both rules take the first non-empty value seen by the question's moment.
 * They differ in what counts as a value and what an attribute is without one.
 */
const AS_OF_SQL: Record<
  AttributeAsOf,
  { value: (id: string) => string; fallback: string }
> = {
  "first-seen": {
    value: (id) => `ifNull(toString(${id}), '')`,
    fallback: NOT_SET_VALUE,
  },
  "true-by-step": {
    value: (id) => `if(ifNull(${id}, false), 'true', '')`,
    fallback: "false",
  },
};

/**
 * An attribute's rule, in SQL: `value` is the event's value, '' when it has
 * none, and `fallback` is what the attribute is when no value was seen in time.
 */
export const attributeAsOfSql = (
  asOf: AttributeAsOfRules,
  id: string,
): { value: string; fallback: string } => {
  const rule = AS_OF_SQL[asOf.get(id) ?? "first-seen"];
  return { value: rule.value(id), fallback: lit(rule.fallback) };
};

/** Attribute ids are column names on `events_base`, so they're validated like flags. */
export const attributeSql = (id: string): string => flagSql(id);

/**
 * The actors an analysis asks about, one row per actor per question, in the
 * CTE named `source`: `k`, the question's number from 1; `converted`, whether
 * the actor had the outcome; and each attribute by its id, as of the
 * question's moment. With `hasLabels`, a `label` column names each question.
 */
export type InsightPopulation = {
  ctes: Cte[];
  source: string;
  hasLabels: boolean;
  warnings: string[];
};

export type InsightsQuery =
  /** Counts per question, for each attribute on its own. */
  | { kind: "singles"; attributes: readonly string[] }
  /** Counts per question, for each pair of attributes, over the kept values. */
  | {
      kind: "pairs";
      kept: ReadonlyMap<string, readonly string[]>;
    }
  /** Size and outcome rate for one question, by each combination of the attributes' values. */
  | {
      kind: "explore";
      question: number;
      attributes: readonly string[];
      /** The name of the column holding the combined values. */
      segmentLabel: string;
      /** The names of the columns holding each segment's size and rate. */
      countColumn: string;
      rateColumn: string;
      /** Smaller segments are pooled into `OTHER_VALUE`. */
      minSize: number;
      /** Sort by rate, highest first; `OTHER_VALUE` is always last. */
      isDescending: boolean;
    };

/** The attributes a query reads, which its population has to provide. */
export const attributesOf = (query: InsightsQuery): string[] => {
  switch (query.kind) {
    case "singles":
      return [...query.attributes];
    case "pairs":
      return [...query.kept.keys()];
    case "explore":
      return [...query.attributes];
  }
};

const COUNTS = ["  count() AS reached,", "  countIf(converted) AS converted"];

// Columns outside a grouping set come back as '', which no attribute value is.
const singlesSelect = (
  { source, hasLabels }: InsightPopulation,
  attributes: readonly string[],
): string => {
  const ids = attributes.map(attributeSql);
  const sets = ["(k)", ...ids.map((id) => `(k, ${id})`)];
  return [
    "SELECT",
    "  k,",
    ...ids.map((id) => `  ${id},`),
    ...(hasLabels ? [`  any(label) AS ${QUESTION_LABEL_COLUMN},`] : []),
    ...COUNTS,
    `FROM ${source}`,
    `GROUP BY GROUPING SETS (${sets.join(", ")})`,
  ].join("\n");
};

const pairsSelect = (
  { source }: InsightPopulation,
  kept: ReadonlyMap<string, readonly string[]>,
): string => {
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
    `  FROM ${source}`,
    ")",
    `GROUP BY GROUPING SETS (${sets.join(", ")})`,
    `HAVING ${ids.map((id) => `${id} != ${lit(OTHER_VALUE)}`).join(" AND ")}`,
  ].join("\n");
};

const exploreSelect = (
  { source }: InsightPopulation,
  {
    question,
    attributes,
    segmentLabel,
    countColumn,
    rateColumn,
    minSize,
    isDescending,
  }: Extract<InsightsQuery, { kind: "explore" }>,
): string => {
  const ids = attributes.map(attributeSql);
  const segment =
    ids.length === 1
      ? ids.join("")
      : `concat(${ids.join(`, ${lit(SEGMENT_SEPARATOR)}, `)})`;
  const label = ident(segmentLabel);
  return [
    "SELECT",
    `  if(segment_size >= ${Math.ceil(minSize)}, segment, ${lit(OTHER_VALUE)}) AS ${label},`,
    `  sum(segment_size) AS ${ident(countColumn)},`,
    `  round(sum(segment_converted) / sum(segment_size), 4) AS ${ident(rateColumn)}`,
    "FROM (",
    "  SELECT",
    `    ${segment} AS segment,`,
    "    count() AS segment_size,",
    "    countIf(converted) AS segment_converted",
    `  FROM ${source}`,
    `  WHERE k = ${Math.trunc(question)}`,
    "  GROUP BY segment",
    ")",
    `GROUP BY ${label}`,
    // By the exact rate, not the rounded column, so it matches the insight's segments
    `ORDER BY ${label} = ${lit(OTHER_VALUE)}, sum(segment_converted) / sum(segment_size) ${isDescending ? "DESC" : "ASC"}, ${label}`,
  ].join("\n");
};

/** A query over an analysis's insight population. */
export const planInsights = (
  population: InsightPopulation,
  query: InsightsQuery,
): QueryPlan => {
  const select = (() => {
    switch (query.kind) {
      case "singles":
        return singlesSelect(population, query.attributes);
      case "pairs":
        return pairsSelect(population, query.kept);
      case "explore":
        return exploreSelect(population, query);
    }
  })();
  return { ctes: population.ctes, select, warnings: population.warnings };
};
