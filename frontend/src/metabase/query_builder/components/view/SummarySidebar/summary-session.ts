import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { ColumnSettings, VisualizationSettings } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryExpression,
  SummaryValueFormat,
  SummaryValueFormats,
} from "./types";
import {
  buildSummaryQuery,
  getPivotConfig,
  getSummaryBase,
  getValueColumnNames,
  withHelperColumns,
} from "./utils";

/** A summary being edited: the question it was started from and the pivot built on top of it. */
export type SummarySession = {
  sourceQuestion: Question;
  base: SummaryBase;
  definition: SummaryDefinition;
  /** Spreadsheet-style custom columns added to the base, so they can be summarized like any column. */
  helperColumns: SummaryExpression[];
  /** Number formats picked for values, keyed by value id. */
  valueFormats: SummaryValueFormats;
};

/** How the summary picks its visualization; prototype variants differ in this. */
export type SummaryDisplayOptions = {
  /** Values split by a second grouping show as a chart when one fits, and as a pivot table otherwise. */
  splitsAsCharts?: boolean;
};

const EMPTY_SUMMARY: SummaryDefinition = {
  rows: [],
  columns: [],
  values: [],
  isPivot: false,
};

const VALUE_FORMAT_SETTINGS: Record<SummaryValueFormat, ColumnSettings> = {
  number: {},
  currency: { number_style: "currency" },
  percent: { number_style: "percent" },
};

// Prototype-only, in-memory: the last edited summary, so reopening the sidebar on the
// question it produced resumes editing it. Lib objects aren't serializable, so this stays out of Redux.
let lastSession: SummarySession | null = null;

export function rememberSummarySession(session: SummarySession) {
  lastSession = session;
}

/** The base the summary is built on, with the session's helper columns added. */
export function getSessionBase({
  base,
  helperColumns,
}: Pick<SummarySession, "base" | "helperColumns">): SummaryBase {
  return helperColumns.length > 0
    ? withHelperColumns(base, helperColumns)
    : base;
}

/**
 * The question that shows the summary: the source question while the summary is empty (with any
 * helper columns added), a pivot table once a pivot has a grouping and a value, and the default
 * display otherwise. Returns `null` when an item no longer resolves against the base query.
 */
export function getSummaryQuestion(
  session: SummarySession,
  { splitsAsCharts = false }: SummaryDisplayOptions = {},
): Question | null {
  const { sourceQuestion, definition, helperColumns } = session;
  const base = getSessionBase(session);
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;
  const hasValues = definition.values.length > 0;
  if (!hasDimensions && !hasValues) {
    return helperColumns.length > 0
      ? sourceQuestion.setQuery(base.query)
      : sourceQuestion;
  }

  const summaryQuery = buildSummaryQuery(base, definition);
  if (summaryQuery == null) {
    return null;
  }

  const summaryQuestion = sourceQuestion
    .setQuery(summaryQuery)
    .updateSettings(getValueFormatSettings(summaryQuery, base, session));

  const defaultQuestion = summaryQuestion
    .setDisplayIsLocked(false)
    .setDefaultDisplay();
  const isPivot = definition.isPivot && hasDimensions && hasValues;
  const isChartedSplit =
    splitsAsCharts && defaultQuestion.display() !== "table";
  if (!isPivot || isChartedSplit) {
    return defaultQuestion;
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

/** Column settings that format each value the way its chip's menu says. */
function getValueFormatSettings(
  summaryQuery: Lib.Query,
  { stageIndex }: SummaryBase,
  { sourceQuestion, definition, valueFormats }: SummarySession,
): Partial<VisualizationSettings> {
  const valueColumnNames = getValueColumnNames(summaryQuery, stageIndex);
  const formattedColumns = definition.values.flatMap((value, index) => {
    const format = valueFormats[value.id];
    const name = valueColumnNames[index];
    return format != null && format !== "number" && name != null
      ? [[getColumnKey({ name }), VALUE_FORMAT_SETTINGS[format]] as const]
      : [];
  });
  if (formattedColumns.length === 0) {
    return {};
  }
  return {
    column_settings: {
      ...sourceQuestion.settings().column_settings,
      ...Object.fromEntries(formattedColumns),
    },
  };
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
    helperColumns: [],
    valueFormats: {},
  };
}
