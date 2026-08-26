import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  ColumnNameColumnSplitSetting,
  FieldRefColumnSplitSetting,
  PivotTableColumnSplitSetting,
} from "metabase-types/api";

import { isColumnNameColumnSplitSetting } from "./pivot";

type PivotOptions = {
  pivot_rows: number[];
  pivot_cols: number[];
  show_row_totals?: boolean;
  show_column_totals?: boolean;
};

function getColumnNamePivotOptions(
  query: Lib.Query,
  stageIndex: number,
  setting: ColumnNameColumnSplitSetting,
): PivotOptions {
  const returnedColumns = Lib.returnedColumns(query, stageIndex);
  const breakoutColumnNames = returnedColumns
    .map((column) => Lib.displayInfo(query, stageIndex, column))
    .filter((columnInfo) => columnInfo.isBreakout)
    .map((columnInfo) => columnInfo.name);

  const { rows, columns } = _.mapObject(setting, (columnNames) => {
    return columnNames
      .map((columnName) => breakoutColumnNames.indexOf(columnName))
      .filter((columnIndex) => columnIndex >= 0);
  });

  return { pivot_rows: rows ?? [], pivot_cols: columns ?? [] };
}

function getFieldRefPivotOptions(
  query: Lib.Query,
  stageIndex: number,
  setting: FieldRefColumnSplitSetting,
): PivotOptions {
  const returnedColumns = Lib.returnedColumns(query, stageIndex);
  const breakoutColumns = returnedColumns.filter(
    (column) => Lib.displayInfo(query, stageIndex, column).isBreakout,
  );

  const { rows, columns } = _.mapObject(setting, (fieldRefs) => {
    if (breakoutColumns.length === 0) {
      return [];
    }

    const nonEmptyFieldRefs = fieldRefs.filter(isNotNull);
    const breakoutIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      breakoutColumns,
      nonEmptyFieldRefs,
    );
    return breakoutIndexes.filter((breakoutIndex) => breakoutIndex >= 0);
  });

  return { pivot_rows: rows ?? [], pivot_cols: columns ?? [] };
}

export function getPivotOptions(question: Question) {
  const query = question.query();
  const stageIndex = -1;
  const setting: PivotTableColumnSplitSetting =
    question.setting("pivot_table.column_split") ?? {};

  // Extract totals settings
  const showRowTotals = question.setting("pivot.show_row_totals") ?? true;
  const showColumnTotals = question.setting("pivot.show_column_totals") ?? true;

  const pivotSplitOptions = isColumnNameColumnSplitSetting(setting)
    ? getColumnNamePivotOptions(query, stageIndex, setting)
    : getFieldRefPivotOptions(query, stageIndex, setting);

  // Add totals settings to the options
  return {
    ...pivotSplitOptions,
    show_row_totals: showRowTotals,
    show_column_totals: showColumnTotals,
  };
}
