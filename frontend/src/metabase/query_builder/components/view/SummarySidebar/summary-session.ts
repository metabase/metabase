import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { SummaryBase, SummaryDefinition } from "./types";
import { buildSummaryQuery, getPivotConfig, getSummaryBase } from "./utils";

/** A summary being edited: the question it was started from and the pivot built on top of it. */
export type SummarySession = {
  sourceQuestion: Question;
  base: SummaryBase;
  definition: SummaryDefinition;
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
 * The question that shows the summary: the source question while the summary is empty,
 * a pivot table once it has a grouping and a value, and the default display otherwise.
 * Returns `null` when an item no longer resolves against the base query.
 */
export function getSummaryQuestion({
  sourceQuestion,
  base,
  definition,
}: SummarySession): Question | null {
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;
  const hasValues = definition.values.length > 0;
  if (!hasDimensions && !hasValues) {
    return sourceQuestion;
  }

  const summaryQuery = buildSummaryQuery(base, definition);
  if (summaryQuery == null) {
    return null;
  }

  const summaryQuestion = sourceQuestion.setQuery(summaryQuery);
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
 * or a new, empty session that summarizes `question`.
 */
export function getSummarySession(
  question: Question,
  candidate: SummarySession | null = lastSession,
): SummarySession {
  const candidateQuestion = candidate && getSummaryQuestion(candidate);
  if (
    candidate != null &&
    candidateQuestion != null &&
    Lib.areLegacyQueriesEqual(
      candidateQuestion.datasetQuery(),
      question.datasetQuery(),
    )
  ) {
    return candidate;
  }
  return {
    sourceQuestion: question,
    base: getSummaryBase(question.query()),
    definition: EMPTY_SUMMARY,
  };
}
