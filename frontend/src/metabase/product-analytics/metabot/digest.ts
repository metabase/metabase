import _ from "underscore";

import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { formatNumber } from "metabase/utils/formatting";
import type { Dataset, Field, RowValue, Table } from "metabase-types/api";

import { parseDateRange } from "../date-range";
import type { AllocatedEvent } from "../events/types";
import type { AnalysisFilters } from "../filters";
import { hasFilters } from "../filters";
import { describeCondition } from "../insights/describe";
import type { InsightOutcome } from "../insights/outcomes";
import type {
  Insight,
  InsightAttribute,
  InsightQuestion,
} from "../insights/types";
import type { InsightsState } from "../insights/use-insights";
import type { AnalysisSpec } from "../spec/types";
import type { Cte } from "../sql/compose";

/** Per question; the panel showed 5, Metabot triages more. */
const MAX_INSIGHTS_PER_QUESTION = 15;
const MAX_RESULT_ROWS = 50;
const MAX_CELL_LENGTH = 80;

export type DigestInput = {
  title: string;
  /** What the chart answers, like "Where do people fall out?". */
  question: string;
  table: Table | undefined;
  /** The table the person column links to, which breakouts read. */
  usersTable: Table | undefined;
  spec: AnalysisSpec;
  dateRange: string;
  filters: AnalysisFilters;
  breakoutColumn: string | null;
  events: readonly AllocatedEvent[];
  dataset: Dataset | undefined;
  insights: InsightsState;
  outcome: InsightOutcome | undefined;
  segmentNames: readonly string[];
  ctes: readonly Cte[];
};

const percent = (value: number) =>
  formatNumber(value, { number_style: "percent", maximumFractionDigits: 1 });

const count = (value: number) =>
  formatNumber(Math.round(value), { maximumFractionDigits: 0 });

const cell = (value: RowValue): string => {
  const text = value === null ? "" : String(value);
  return (
    text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH)}…` : text
  ).replace(/\|/g, "\\|");
};

const markdownTable = (
  columns: readonly string[],
  rows: readonly (readonly RowValue[])[],
): string[] => [
  `| ${columns.join(" | ")} |`,
  `| ${columns.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
];

const describeDateRange = (value: string): string => {
  const parsed = parseDateRange(value);
  return parsed !== undefined ? getDateFilterDisplayName(parsed) : value;
};

const settingsLines = ({
  spec,
  dateRange,
  filters,
  breakoutColumn,
  events,
}: DigestInput): string[] => {
  const funnel = spec.funnel;
  const parts = [
    `Counting: ${spec.grain}`,
    `Date range: ${describeDateRange(dateRange)}`,
    `Breakout: ${breakoutColumn ?? "none"}`,
    `Filters: ${hasFilters(filters) ? "some (who's included is narrowed)" : "none"}`,
    ...(funnel !== undefined
      ? [
          `Window: ${funnel.window.value} ${funnel.window.unit}s`,
          `Order: ${funnel.ordering}`,
        ]
      : []),
  ];
  const steps =
    funnel !== undefined
      ? [
          `Steps: ${funnel.steps
            .map((step, index) => `${index + 1}. ${step.label} (${step.flag})`)
            .join(" → ")}`,
        ]
      : [];
  const eventFlags =
    events.length > 0
      ? [
          `Event flags on events_base: ${events
            .map(({ flag, event }) => `${flag} = ${event.name}`)
            .join("; ")}`,
        ]
      : [];
  return [parts.join(" · "), ...steps, ...eventFlags];
};

const resultLines = (dataset: Dataset | undefined): string[] => {
  const data = dataset?.data;
  if (data === undefined) {
    return ["The result hasn't loaded."];
  }
  const rows = data.rows.slice(0, MAX_RESULT_ROWS);
  return [
    ...markdownTable(
      data.cols.map((col) => col.display_name || col.name),
      rows,
    ),
    ...(data.rows.length > rows.length
      ? [`(${rows.length} of ${data.rows.length} rows shown)`]
      : []),
  ];
};

const insightLine = (
  insight: Insight,
  attributes: readonly InsightAttribute[],
  outcome: InsightOutcome,
  rank: number,
): string => {
  const conditions = insight.conditions
    .map(({ attributeId, value }) => {
      const attribute = attributes.find(({ id }) => id === attributeId);
      return `${describeCondition(attribute, value)} [${attributeId}=${value}]`;
    })
    .join(" and ");
  const sign = insight.excess >= 0 ? "+" : "−";
  return `${rank}. ${conditions}: ${outcome.describeRate(percent(insight.rate))} vs. ${percent(insight.restRate)} of everyone else · ${count(insight.reached)} in the group · ${sign}${count(Math.abs(insight.excess))} outcomes vs. everyone else's rate`;
};

const questionLines = (
  question: InsightQuestion,
  insights: readonly Insight[],
  attributes: readonly InsightAttribute[],
  outcome: InsightOutcome,
): string[] => {
  const heading = (question.details ?? question.labels).join(" → ");
  const ranked = _.sortBy(
    insights.filter((insight) => insight.question === question.question),
    (insight) => -Math.abs(insight.excess),
  ).slice(0, MAX_INSIGHTS_PER_QUESTION);
  return [
    `### ${heading} (${count(question.reached)} in total, ${outcome.describeRate(percent(question.converted / Math.max(question.reached, 1)))})`,
    ...(ranked.length > 0
      ? ranked.map((insight, index) =>
          insightLine(insight, attributes, outcome, index + 1),
        )
      : ["Nothing stood out."]),
  ];
};

const attributeLine = (attribute: InsightAttribute): string =>
  attribute.kind === "column"
    ? `${attribute.id}: ${attribute.displayName} (column \`${attribute.column}\`${attribute.from === "users" ? ", users table" : ""})`
    : `${attribute.id}: did "${attribute.displayName}" ${attribute.minCount}+ times (event flag \`${attribute.flag}\`)`;

const insightsLines = (
  insights: InsightsState,
  outcome: InsightOutcome | undefined,
): string[] => {
  if (insights.status === "idle" || outcome === undefined) {
    return ["This kind of analysis has no insights."];
  }
  if (insights.status === "loading") {
    return ["Insights are still loading."];
  }
  if (insights.status === "error") {
    return [`Insights failed: ${insights.error}`];
  }
  const { attributes, questions } = insights;
  return [
    'Raw associations, not controlled for anything. Each group is compared with everyone else at the same question. Attribute values are as of the question\'s moment (e.g. reaching the step); "(not set)" means no value had been seen by then.',
    `Attributes compared: ${attributes.map(attributeLine).join("; ")}`,
    "",
    ...questions.flatMap((question) => [
      ...questionLines(question, insights.insights, attributes, outcome),
      "",
    ]),
  ];
};

const fieldLine = (field: Field): string =>
  field.display_name !== field.name
    ? `${field.name} (${field.display_name})`
    : field.name;

/**
 * PROTOTYPE: what Metabot is told about the analysis on screen, as markdown:
 * its settings, its result, its insights, and what it can query and suggest.
 */
export const getAnalysisDigest = (input: DigestInput): string =>
  [
    `# ${input.title}`,
    `The chart answers: ${input.question}`,
    ...settingsLines(input),
    "",
    "## Result",
    ...resultLines(input.dataset),
    "",
    "## Insights",
    ...insightsLines(input.insights, input.outcome),
    "## Vocabulary",
    `Event table \`${input.table?.name ?? "events"}\` columns: ${(input.table?.fields ?? []).map(fieldLine).join(", ")}`,
    `Saved event segments (usable as steps): ${input.segmentNames.join(", ") || "none"}`,
    input.usersTable !== undefined
      ? `Breakouts (suggest_analysis) are by the person's current traits, columns of \`${input.usersTable.name}\`: ${(input.usersTable.fields ?? []).map(fieldLine).join(", ")}. To split by an event column, filter instead, or chart it with run_event_sql.`
      : "Breakouts (suggest_analysis) are by event table columns.",
  ].join("\n");

/** The columns of the CTEs Metabot reads most, so it doesn't have to look. */
const CTE_COLUMNS: Record<string, string> = {
  events_base:
    "Columns: person_id, session_id, created_at, event_id, event_name, url_path, ev_1… (0/1, one per event in the analysis), attr_1… (the insight attributes on each event; see Insights).",
  scoped_events:
    "Columns: actor (the person, session or event counted), ts (event time), and the analysis's flags, like step_1… for a funnel.",
  funnel_people:
    "Columns: actor, level (steps reached in order), t_1… (first time of each step; 1970-01-01 when never, so test with > toDateTime(0)), attr_N_first and attr_N_seen.",
};

const populationColumns = (name: string) =>
  `The insights population. Columns: actor (the person), k (the question, from 1${name === "funnel_transitions" ? ": transition k is step k → k+1" : ""}), converted (0/1), attr_1… (each attribute as of that moment, as strings: 'true', '(not set)')${name === "funnel_transitions" ? ", reached_at (when they reached step k)" : ""}. For a rate by group: SELECT attr_N, count(), avg(converted) FROM ${name} WHERE k = … GROUP BY attr_N.`;

/** The CTEs Metabot's queries can read, with what each holds. */
export const getDigestCtes = (
  ctes: readonly Cte[],
  populationSource: string | undefined,
) =>
  ctes.map(({ name, body, note }) => {
    const columns =
      name === populationSource ? populationColumns(name) : CTE_COLUMNS[name];
    const description = [note, columns].filter(Boolean).join(". ");
    return {
      name,
      sql: body.trim(),
      ...(description !== "" ? { description } : {}),
    };
  });
