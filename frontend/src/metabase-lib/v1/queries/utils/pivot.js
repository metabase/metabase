import _ from "underscore";

import * as Lib from "metabase-lib";

export function getPivotColumnSplit(question) {
  const setting = question.setting("pivot_table.column_split") ?? {};
  if (setting.rows == null || setting.columns == null) {
    return {};
  }

  const query = question.query();
  const stageIndex = -1;
  const returnedColumns = Lib.returnedColumns(query, stageIndex);
  const breakoutColumnNames = returnedColumns
    .map(column => Lib.displayInfo(query, stageIndex, column))
    .filter(columnInfo => columnInfo.isBreakout)
    .map(columnInfo => columnInfo.name);

  const { rows: pivot_rows, columns: pivot_cols } = _.mapObject(
    setting,
    columnNames => {
      return columnNames
        .map(columnName => breakoutColumnNames.indexOf(columnName))
        .filter(columnIndex => columnIndex >= 0);
    },
  );

  return { pivot_rows, pivot_cols };
}
