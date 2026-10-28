import _ from "underscore";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { SummaryBase, SummaryDefinition } from "./types";
import {
  buildSummaryQuery,
  getPivotColumnSplit,
  getSummaryBase,
} from "./utils";

/** A filter on the summary's output, e.g. Count > 10, with the column it filters when it has one. */
type SummaryOutputFilter = {
  clause: Lib.FilterClause;
  column: Lib.ColumnMetadata | null;
};

/**
 * A summary being edited: the question it was started from, the pivot built on top of it, and
 * the filters on the pivot's output that the query builder added.
 */
export type SummarySession = {
  sourceQuestion: Question;
  base: SummaryBase;
  definition: SummaryDefinition;
  outputFilters: readonly SummaryOutputFilter[];
};

const EMPTY_SUMMARY: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
};

// Prototype-only, in-memory: the last edited summary, so reopening the sidebar on the
// question it produced resumes editing it. Lib objects aren't serializable, so this stays out of Redux.
let lastSession: SummarySession | null = null;

export function rememberSummarySession(session: SummarySession) {
  lastSession = session;
}

/**
 * `summaryQuery` with the output filters that still apply, in a stage of their own: a filter on a
 * column the summary no longer outputs, like a replaced breakout, is left out.
 */
function withOutputFilters(
  summaryQuery: Lib.Query,
  outputFilters: readonly SummaryOutputFilter[],
): Lib.Query {
  if (outputFilters.length === 0) {
    return summaryQuery;
  }
  let query = Lib.appendStage(summaryQuery);
  const columns = Lib.filterableColumns(query, -1);
  for (const { clause, column } of outputFilters) {
    if (
      column == null ||
      Lib.findMatchingColumn(query, -1, column, columns) != null
    ) {
      query = Lib.filter(query, -1, clause);
    }
  }
  return Lib.dropEmptyStages(query);
}

/**
 * The question that shows the summary: the source question while the summary is empty, a pivot
 * table once values are split by both rows and columns, and otherwise the display the query
 * builder picks for the query, e.g. a line chart for values by a date.
 * Returns `null` when an item no longer resolves against the base query.
 */
export function getSummaryQuestion({
  sourceQuestion,
  base,
  definition,
  outputFilters,
}: SummarySession): Question | null {
  const hasRows = definition.rows.length > 0;
  const hasColumns = definition.columns.length > 0;
  const hasValues = definition.values.length > 0;
  if (!hasRows && !hasColumns && !hasValues) {
    return sourceQuestion;
  }

  const summaryQuery = buildSummaryQuery(base, definition);
  if (summaryQuery == null) {
    return null;
  }

  const summaryQuestion = sourceQuestion.setQuery(
    withOutputFilters(summaryQuery, outputFilters),
  );
  if (!hasRows || !hasColumns || !hasValues) {
    return summaryQuestion.setDisplayIsLocked(false).setDefaultDisplay();
  }

  return summaryQuestion
    .setDisplay("pivot")
    .lockDisplay()
    .updateSettings({
      "pivot_table.column_split": getPivotColumnSplit(
        summaryQuery,
        base.stageIndex,
        definition,
      ),
    });
}

/** The filters in the stage right after the summary, each with the column it filters. */
function getOutputFilters(
  query: Lib.Query,
  summaryStageIndex: number,
): SummaryOutputFilter[] {
  const stageIndex = summaryStageIndex + 1;
  if (Lib.stageCount(query) <= stageIndex) {
    return [];
  }
  return Lib.filters(query, stageIndex).map((clause) => ({
    clause,
    column: Lib.filterParts(query, stageIndex, clause)?.column ?? null,
  }));
}

function getStageSummaryNames(query: Lib.Query, stageIndex: number): string[] {
  return [
    ...Lib.aggregations(query, stageIndex),
    ...Lib.breakouts(query, stageIndex),
  ].map((clause) => Lib.displayInfo(query, stageIndex, clause).displayName);
}

function getExpressionNames(query: Lib.Query, stageIndex: number): string[] {
  return Lib.expressions(query, stageIndex).map(
    (expression) => Lib.displayInfo(query, stageIndex, expression).displayName,
  );
}

/** `query` at `stageIndex` without the clauses the summary added there, and without later stages. */
function removeSummary(
  query: Lib.Query,
  stageIndex: number,
  summaryExpressionNames: string[],
): Lib.Query {
  let result = query;
  while (Lib.stageCount(result) > stageIndex + 1) {
    result = Lib.dropStage(result);
  }
  for (const clause of [
    ...Lib.aggregations(result, stageIndex),
    ...Lib.breakouts(result, stageIndex),
  ]) {
    result = Lib.removeClause(result, stageIndex, clause);
  }
  for (const expression of Lib.expressions(result, stageIndex)) {
    const { displayName } = Lib.displayInfo(result, stageIndex, expression);
    if (summaryExpressionNames.includes(displayName)) {
      result = Lib.removeClause(result, stageIndex, expression);
    }
  }
  return result;
}

/**
 * `session`'s summary carried over to `question` when `question` still shows that summary over a
 * changed stage, e.g. a filter added or removed in the query builder: the same wells, built on the
 * new stage, under the filters `question` has on their output. `null` when `question` doesn't
 * carry the session's aggregations and breakouts.
 */
function rebaseSummarySession(
  session: SummarySession,
  question: Question,
): SummarySession | null {
  const { sourceQuestion, base, definition } = session;
  const summaryQuery = buildSummaryQuery(base, definition);
  if (summaryQuery == null) {
    return null;
  }
  const stageIndex = Lib.stageCount(summaryQuery) - 1;
  const summaryNames = getStageSummaryNames(summaryQuery, stageIndex);
  const query = question.query();
  if (
    summaryNames.length === 0 ||
    Lib.stageCount(query) <= stageIndex ||
    !_.isEqual(getStageSummaryNames(query, stageIndex), summaryNames)
  ) {
    return null;
  }

  const baseExpressionNames = getExpressionNames(base.query, base.stageIndex);
  const summaryExpressionNames = getExpressionNames(
    summaryQuery,
    stageIndex,
  ).filter((name) => !baseExpressionNames.includes(name));
  const nextSourceQuestion = sourceQuestion.setQuery(
    Lib.dropEmptyStages(
      removeSummary(query, stageIndex, summaryExpressionNames),
    ),
  );
  const nextBase = getSummaryBase(nextSourceQuestion.query());
  if (buildSummaryQuery(nextBase, definition) == null) {
    return null;
  }
  return {
    sourceQuestion: nextSourceQuestion,
    base: nextBase,
    definition,
    outputFilters: getOutputFilters(query, stageIndex),
  };
}

/** Whether `question` is the one the session's summary produces. */
export function isSummaryShown(
  session: SummarySession,
  question: Question,
): boolean {
  const summaryQuestion = getSummaryQuestion(session);
  return (
    summaryQuestion != null &&
    Lib.areLegacyQueriesEqual(
      summaryQuestion.datasetQuery(),
      question.datasetQuery(),
    )
  );
}

/**
 * The session whose summary `question` shows — `candidate`, or the last edited session by default —
 * carried over to `question` when only the stage under its summary changed, or else a new, empty
 * session that summarizes `question`.
 */
export function getSummarySession(
  question: Question,
  candidate: SummarySession | null = lastSession,
): SummarySession {
  if (candidate != null) {
    if (isSummaryShown(candidate, question)) {
      return candidate;
    }
    const rebasedSession = rebaseSummarySession(candidate, question);
    if (rebasedSession != null) {
      return rebasedSession;
    }
  }
  return {
    sourceQuestion: question,
    base: getSummaryBase(question.query()),
    definition: EMPTY_SUMMARY,
    outputFilters: [],
  };
}
