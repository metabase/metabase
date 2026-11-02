import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryValue,
} from "./types";
import {
  buildSummaryQuery,
  createItemId,
  getPivotConfig,
  getSummaryBase,
} from "./utils";

/**
 * A summary being edited: the question it was started from and the summary built on top of it.
 * `pivot` shows a grouped summary as a pivot table; `chart` lets the question pick its default chart.
 */
export type SummarySession = {
  sourceQuestion: Question;
  base: SummaryBase;
  definition: SummaryDefinition;
  presentation: "pivot" | "chart";
};

const EMPTY_SUMMARY: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

// Prototype-only, in-memory: the last edited pivot summary, so reopening the sidebar on the
// question it produced resumes editing it. Lib objects aren't serializable, so this stays out of Redux.
let lastSession: SummarySession | null = null;

export function rememberSummarySession(session: SummarySession) {
  if (session.presentation === "pivot") {
    lastSession = session;
  }
}

/**
 * The question that shows the summary. Returns `null` when an item no longer resolves against the base query.
 *
 * - `pivot`: the source question while the summary is empty, a pivot table once it has a grouping and a value,
 *   and the default display otherwise.
 * - `chart`: the base rows as a table while the summary is empty, and the default display otherwise.
 */
export function getSummaryQuestion({
  sourceQuestion,
  base,
  definition,
  presentation,
}: SummarySession): Question | null {
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;
  const hasValues = definition.values.length > 0;
  if (!hasDimensions && !hasValues) {
    return presentation === "pivot"
      ? sourceQuestion
      : sourceQuestion.setQuery(base.query).setSettings({}).setDisplay("table");
  }

  const summaryQuery = buildSummaryQuery(base, definition);
  if (summaryQuery == null) {
    return null;
  }

  const summaryQuestion = sourceQuestion.setQuery(summaryQuery);
  if (presentation === "chart") {
    // the source chart's settings name its old columns, so let the new grouping pick fresh ones
    return summaryQuestion
      .setSettings({})
      .setDisplayIsLocked(false)
      .setDefaultDisplay();
  }
  if (!hasDimensions || !hasValues) {
    return summaryQuestion.setDisplayIsLocked(false).setDefaultDisplay();
  }

  const { columnSplit } = getPivotConfig(
    summaryQuery,
    base.stageIndex,
    definition,
  );
  return summaryQuestion
    .setDisplay("pivot")
    .lockDisplay()
    .updateSettings({ "pivot_table.column_split": columnSplit });
}

/**
 * The session whose summary `question` shows — `candidate`, or the last edited session by default —
 * or a new, empty pivot session that summarizes `question`.
 */
export function getSummarySession(
  question: Question,
  candidate: SummarySession | null = lastSession,
): SummarySession {
  if (candidate != null && isSessionOf(candidate, question)) {
    return candidate;
  }
  return {
    sourceQuestion: question,
    base: getSummaryBase(question.query()),
    definition: EMPTY_SUMMARY,
    presentation: "pivot",
  };
}

/** Whether `question` is what `session` currently shows. */
export function isSessionOf(
  session: SummarySession,
  question: Question,
): boolean {
  const sessionQuestion = getSummaryQuestion(session);
  return (
    sessionQuestion != null &&
    Lib.areLegacyQueriesEqual(
      sessionQuestion.datasetQuery(),
      question.datasetQuery(),
    )
  );
}

/**
 * A chart session that edits `question`'s own summary: the last stage's first grouping
 * becomes Rows, further groupings Columns, and its aggregations Values. Aggregations
 * that aren't a count, a column aggregation, or a metric are dropped once the summary changes.
 */
export function getChartSummarySession(question: Question): SummarySession {
  const query = question.query();
  const stageIndex = -1;
  const breakouts = Lib.breakouts(query, stageIndex);
  const aggregations = Lib.aggregations(query, stageIndex);

  const baseQuery = [...breakouts, ...aggregations].reduce(
    (nextQuery, clause) => Lib.removeClause(nextQuery, stageIndex, clause),
    Lib.limit(Lib.removeOrderBys(query, stageIndex), stageIndex, null),
  );

  const dimensions = breakouts.flatMap((breakout): SummaryDimension[] => {
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    return column != null ? [{ id: createItemId(), column }] : [];
  });
  const values = aggregations
    .map((aggregation, index) =>
      getSummaryValue(query, stageIndex, aggregation, index),
    )
    .filter((value): value is SummaryValue => value != null);

  return {
    sourceQuestion: question,
    base: { query: baseQuery, stageIndex },
    definition: {
      rows: dimensions.slice(0, 1),
      columns: dimensions.slice(1),
      values,
    },
    presentation: "chart",
  };
}

function getSummaryValue(
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause,
  aggregationIndex: number,
): SummaryValue | null {
  const metric = Lib.availableMetrics(query, stageIndex).find(
    (metric) =>
      Lib.displayInfo(query, stageIndex, metric).aggregationPosition ===
      aggregationIndex,
  );
  if (metric != null) {
    return { id: createItemId(), type: "metric", metric };
  }

  const operator = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, stageIndex),
    aggregation,
  ).find((operator) => Lib.displayInfo(query, stageIndex, operator).selected);
  if (operator == null) {
    return null;
  }

  const { shortName, requiresColumn } = Lib.displayInfo(
    query,
    stageIndex,
    operator,
  );
  if (!requiresColumn) {
    return shortName === "count" ? { id: createItemId(), type: "count" } : null;
  }

  const column = Lib.aggregationOperatorColumns(operator).find(
    (column) => Lib.displayInfo(query, stageIndex, column).selected,
  );
  return column != null
    ? {
        id: createItemId(),
        type: "column",
        column,
        operatorShortName: shortName,
      }
    : null;
}
