import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isColumnNameColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";
import type {
  ColumnNameColumnSplitSetting,
  FieldRefColumnSplitSetting,
  FieldReference,
} from "metabase-types/api";

import type { SummaryPivotChange } from "./types";
import { getResultColumnNames } from "./utils";

const STAGE_INDEX = -1;

function getColumns(query: Lib.Query) {
  return Lib.returnedColumns(query, STAGE_INDEX).map((column) => ({
    key: Lib.columnKey(column),
    name: Lib.displayInfo(query, STAGE_INDEX, column).name,
  }));
}

/**
 * `updateQuestion` renames the entries of the column split from the columns of the question's
 * query to the columns of the new query. So that this gives `columnSplit`, each of its names is
 * replaced with the name that the column has in the question's query.
 */
function getColumnSplitToSync(
  query: Lib.Query,
  nextQuery: Lib.Query,
  columnSplit: ColumnNameColumnSplitSetting,
): ColumnNameColumnSplitSetting {
  const nameByKey = new Map(
    getColumns(query).map(({ key, name }) => [key, name]),
  );
  const nextKeyByName = new Map(
    getColumns(nextQuery).map(({ key, name }) => [name, key]),
  );
  const getName = (nextName: string) => {
    const key = nextKeyByName.get(nextName);
    const name = key !== undefined ? nameByKey.get(key) : undefined;
    return name ?? nextName;
  };
  return {
    rows: columnSplit.rows.map(getName),
    columns: columnSplit.columns.map(getName),
    values: columnSplit.values.map(getName),
  };
}

/**
 * Whether the question can show a pivot table of the summary in the stage. The column split is
 * about the columns of the last stage, so no stage can come after the summary. The database must
 * support pivot tables. When it is not loaded, the check passes, as for the pivot table itself.
 */
export function canPivotSummary(question: Question, stageIndex: number) {
  const isLastStage =
    stageIndex === -1 || stageIndex === Lib.stageCount(question.query()) - 1;
  return isLastStage && (question.database()?.supportsPivots() ?? true);
}

function getColumnNames(
  query: Lib.Query,
  fieldRefs: (FieldReference | null)[] = [],
): string[] {
  const columns = Lib.returnedColumns(query, STAGE_INDEX);
  const refs = fieldRefs.filter(isNotNull);
  if (columns.length === 0 || refs.length === 0) {
    return [];
  }
  return Lib.findColumnIndexesFromLegacyRefs(query, STAGE_INDEX, columns, refs)
    .filter((index) => index >= 0)
    .map((index) => Lib.displayInfo(query, STAGE_INDEX, columns[index]).name);
}

function getColumnNameSplit(
  query: Lib.Query,
  columnSplit: FieldRefColumnSplitSetting,
): ColumnNameColumnSplitSetting {
  return {
    rows: getColumnNames(query, columnSplit.rows),
    columns: getColumnNames(query, columnSplit.columns),
    values: getColumnNames(query, columnSplit.values),
  };
}

/**
 * The column split of the pivot table that the question shows, by column name, or `undefined`
 * when it shows none. It is read as the pivot table reads it: a split by field reference is
 * resolved to column names, and a grouping that the split doesn't have goes in its rows. The
 * question keeps the split it has.
 */
export function getPivotColumnSplit(
  question: Question,
): ColumnNameColumnSplitSetting | undefined {
  const setting = question.settings()["pivot_table.column_split"];
  if (question.display() !== "pivot" || !setting) {
    return undefined;
  }
  const query = question.query();
  const columnSplit = isColumnNameColumnSplitSetting(setting)
    ? setting
    : getColumnNameSplit(query, setting);
  const { rows = [], columns = [], values = [] } = columnSplit;
  const { breakoutNames } = getResultColumnNames(query, STAGE_INDEX);
  const missingNames = breakoutNames.filter(
    (name) => !rows.includes(name) && !columns.includes(name),
  );
  return { rows: [...rows, ...missingNames], columns, values };
}

export function getSummaryQuestion(
  question: Question,
  nextQuery: Lib.Query,
  pivotChange?: SummaryPivotChange,
): Question {
  const nextQuestion = question.setQuery(nextQuery);
  if (pivotChange?.type === "show") {
    return nextQuestion
      .setDisplay("pivot")
      .lockDisplay()
      .updateSettings({
        "pivot_table.column_split": getColumnSplitToSync(
          question.query(),
          nextQuery,
          pivotChange.columnSplit,
        ),
      });
  }
  if (pivotChange?.type === "hide") {
    return nextQuestion.setDisplayIsLocked(false).setDefaultDisplay();
  }
  return nextQuestion.setDefaultDisplay();
}
