import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  ColumnNameCollapsedRowsSetting,
  ColumnNameColumnSplitSetting,
  DatasetColumn,
  FieldRefColumnSplitSetting,
  FieldReference,
  PivotTableCollapsedRowsSetting,
  PivotTableColumnSplitSetting,
} from "metabase-types/api";

type PivotOptions = {
  pivot_rows: number[];
  pivot_cols: number[];
};

export function isColumnNameColumnSplitSetting(
  setting: PivotTableColumnSplitSetting,
): setting is ColumnNameColumnSplitSetting {
  const { rows = [], columns = [], values = [] } = setting;
  return (
    rows.every(value => typeof value === "string") &&
    columns.every(value => typeof value === "string") &&
    values.every(value => typeof value === "string")
  );
}

export function isColumnNameCollapsedRowsSetting(
  setting: PivotTableCollapsedRowsSetting,
): setting is ColumnNameCollapsedRowsSetting {
  const { rows = [] } = setting;
  return rows.every(value => typeof value === "string");
}

function getColumnNamePivotOptions(
  query: Lib.Query,
  stageIndex: number,
  setting: ColumnNameColumnSplitSetting,
): PivotOptions {
  const returnedColumns = Lib.returnedColumns(query, stageIndex);
  const breakoutColumnNames = returnedColumns
    .map(column => Lib.displayInfo(query, stageIndex, column))
    .filter(columnInfo => columnInfo.isBreakout)
    .map(columnInfo => columnInfo.name);

  const { rows, columns } = _.mapObject(setting, columnNames => {
    return columnNames
      .map(columnName => breakoutColumnNames.indexOf(columnName))
      .filter(columnIndex => columnIndex >= 0);
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
    column => Lib.displayInfo(query, stageIndex, column).isBreakout,
  );

  const { rows, columns } = _.mapObject(setting, fieldRefs => {
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
    return breakoutIndexes.filter(breakoutIndex => breakoutIndex >= 0);
  });

  return { pivot_rows: rows ?? [], pivot_cols: columns ?? [] };
}

export function getPivotOptions(question: Question) {
  const query = question.query();
  const stageIndex = -1;
  const setting: PivotTableColumnSplitSetting =
    question.setting("pivot_table.column_split") ?? {};

  if (isColumnNameColumnSplitSetting(setting)) {
    return getColumnNamePivotOptions(query, stageIndex, setting);
  } else {
    return getFieldRefPivotOptions(query, stageIndex, setting);
  }
}

function migratePivotSetting(
  columns: DatasetColumn[],
  fieldRefs: (FieldReference | null)[] = [],
): string[] {
  const columnNameByFieldRef = Object.fromEntries(
    columns.map(column => [JSON.stringify(column.field_ref), column.name]),
  );

  return fieldRefs
    .map(fieldRef => columnNameByFieldRef[JSON.stringify(fieldRef)])
    .filter(isNotNull);
}

// Field ref-based visualization settings are considered legacy and are not used
// for new questions. To not break existing questions we need to support both
// old- and new-style settings until they are fully migrated.
//
// We cannot auto-migrate the settings on read because all existing questions
// visualized as pivot tables would become ad-hoc. To avoid that we only migrate
// the settings when they are modified, and all code that reads the settings
// runs the migration without storing the new value.
export function migratePivotColumnSplitSetting(
  setting: PivotTableColumnSplitSetting,
  columns: DatasetColumn[],
): ColumnNameColumnSplitSetting {
  if (isColumnNameColumnSplitSetting(setting)) {
    return setting;
  }

  return {
    rows: migratePivotSetting(columns, setting.rows),
    columns: migratePivotSetting(columns, setting.columns),
    values: migratePivotSetting(columns, setting.values),
  };
}
