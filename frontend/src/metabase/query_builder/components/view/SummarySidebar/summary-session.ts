import _ from "underscore";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { SummaryBase, SummaryDefinition } from "./types";
import {
  buildSummaryQuery,
  getPivotColumnSplit,
  getSummaryBase,
} from "./utils";

/** A column a summary-output filter reads, with its name when the filter was made. */
type OutputFilterColumn = {
  column: Lib.ColumnMetadata;
  displayName: string;
};

/**
 * A filter on the summary's output, e.g. Count > 10 OR Sum of Total > 5, with every column it
 * reads, so it applies only while the summary outputs all of them.
 */
export type SummaryOutputFilter = {
  clause: Lib.FilterClause;
  displayName: string;
  columns: readonly OutputFilterColumn[];
};

/** An output filter left out of the summary, because the summary no longer outputs some of its columns. */
export type StaleOutputFilter = {
  filter: SummaryOutputFilter;
  missingColumnNames: string[];
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

/** The names of the columns `filter` reads that the stage after `summaryQuery` can't filter on. */
function getMissingColumnNames(
  summaryQuery: Lib.Query,
  filter: SummaryOutputFilter,
): string[] {
  const query = Lib.appendStage(summaryQuery);
  const columns = Lib.filterableColumns(query, -1);
  // a name check too: a replaced aggregation can keep the old one's column name, e.g. `sum`
  const isOutput = ({ column, displayName }: OutputFilterColumn) => {
    const match = Lib.findMatchingColumn(query, -1, column, columns);
    return (
      match != null &&
      Lib.displayInfo(query, -1, match).displayName === displayName
    );
  };
  return filter.columns
    .filter((column) => !isOutput(column))
    .map(({ displayName }) => displayName);
}

/**
 * `summaryQuery` with the output filters that still apply, in a stage of their own: a filter on a
 * column the summary no longer outputs, like a replaced breakout or a removed value, is left out.
 */
function withOutputFilters(
  summaryQuery: Lib.Query,
  outputFilters: readonly SummaryOutputFilter[],
): Lib.Query {
  if (outputFilters.length === 0) {
    return summaryQuery;
  }
  const query = outputFilters
    .filter(
      (filter) => getMissingColumnNames(summaryQuery, filter).length === 0,
    )
    .reduce(
      (nextQuery, { clause }) => Lib.filter(nextQuery, -1, clause),
      Lib.appendStage(summaryQuery),
    );
  return Lib.dropEmptyStages(query);
}

/**
 * The session's output filters that its summary leaves out, each with the columns it misses. They
 * stay in the session, and apply again once the summary outputs those columns again.
 */
export function getStaleOutputFilters({
  base,
  definition,
  outputFilters,
}: SummarySession): StaleOutputFilter[] {
  if (outputFilters.length === 0) {
    return [];
  }
  const summaryQuery = buildSummaryQuery(base, definition);
  return outputFilters
    .map((filter) => ({
      filter,
      missingColumnNames:
        summaryQuery != null && hasSummary(definition)
          ? getMissingColumnNames(summaryQuery, filter)
          : filter.columns.map(({ displayName }) => displayName),
    }))
    .filter(({ missingColumnNames }) => missingColumnNames.length > 0);
}

/** `session` without `filter`, e.g. a stale output filter the user dismissed. */
export function removeOutputFilter(
  session: SummarySession,
  filter: SummaryOutputFilter,
): SummarySession {
  return {
    ...session,
    outputFilters: session.outputFilters.filter((item) => item !== filter),
  };
}

function hasSummary({ rows, columns, values }: SummaryDefinition): boolean {
  return rows.length > 0 || columns.length > 0 || values.length > 0;
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
  if (!hasSummary(definition)) {
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

function getPartsColumns(parts: Lib.ExpressionParts): Lib.ColumnMetadata[] {
  return parts.args.flatMap((arg) => {
    if (Lib.isColumnMetadata(arg)) {
      return [arg];
    }
    return Lib.isExpressionParts(arg) ? getPartsColumns(arg) : [];
  });
}

/** The filters in the stage right after the summary, each with every column it reads. */
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
    displayName: Lib.displayInfo(query, stageIndex, clause).longDisplayName,
    columns: getPartsColumns(
      Lib.expressionParts(query, stageIndex, clause),
    ).map((column) => ({
      column,
      displayName: Lib.displayInfo(query, stageIndex, column).displayName,
    })),
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
    // stale filters aren't in `question`; keep them, so they can still apply again
    outputFilters: [
      ...getOutputFilters(query, stageIndex),
      ...getStaleOutputFilters(session).map(({ filter }) => filter),
    ],
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
