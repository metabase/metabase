import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isColumnNameColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";
import type { ColumnNameColumnSplitSetting } from "metabase-types/api";

import type { SummaryPivotChange } from "./types";

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

/** The Rows of the pivot table that the question shows, when it shows one. */
export function getPivotRowKeys(question: Question): string[] | undefined {
  const columnSplit = question.settings()["pivot_table.column_split"];
  if (
    question.display() !== "pivot" ||
    !columnSplit ||
    !isColumnNameColumnSplitSetting(columnSplit)
  ) {
    return undefined;
  }
  return columnSplit.rows;
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
