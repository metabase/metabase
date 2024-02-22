import * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  DatasetData,
  DimensionReference,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

type FieldRefWithIndex = {
  fieldRef: DimensionReference;
  originalIndex: number;
};

function findColumnIndexesWithMissingRefs(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): number[] {
  const fieldRefs = columnSettings.reduce(
    (fieldRefs: FieldRefWithIndex[], { fieldRef }, originalIndex) => {
      if (fieldRef != null) {
        fieldRefs.push({ fieldRef, originalIndex });
      }
      return fieldRefs;
    },
    [],
  );
  const columnIndexBySettingIndex = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    fieldRefs.map(({ fieldRef }) => fieldRef),
  );
  return columnIndexBySettingIndex.reduce(
    (columnIndexes: number[], columnIndex, fieldRefIndex) => {
      if (columnIndex >= 0) {
        columnIndexes[fieldRefs[fieldRefIndex].originalIndex] = columnIndex;
      }
      return columnIndexes;
    },
    new Array(columnSettings.length).fill(-1),
  );
}

function findColumnIndexesWithNameFallback(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): number[] {
  const columnIndexBySettingIndex = findColumnIndexesWithMissingRefs(
    query,
    stageIndex,
    columns,
    columnSettings,
  );
  const columnIndexByName = new Map(
    columns.map((column, columnIndex) => [column.name, columnIndex]),
  );
  columnIndexBySettingIndex.forEach(columnIndex => {
    if (columnIndex >= 0) {
      columnIndexByName.delete(columns[columnIndex].name);
    }
  });
  return columnIndexBySettingIndex.map(
    (columnIndex: number, settingIndex: number) => {
      if (columnIndex >= 0) {
        return columnIndex;
      }

      const setting = columnSettings[settingIndex];
      const fallbackColumnIndex = columnIndexByName.get(setting.name);
      if (fallbackColumnIndex != null) {
        columnIndexByName.delete(setting.name);
        return fallbackColumnIndex;
      }

      return -1;
    },
  );
}

export function findColumnIndexesForColumnSettings(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  return findColumnIndexesWithNameFallback(
    query,
    stageIndex,
    columns,
    columnSettings,
  );
}

export function findColumnSettingIndexesForColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexes = findColumnIndexesWithNameFallback(
    query,
    stageIndex,
    columns,
    columnSettings,
  );
  return columnIndexes.reduce(
    (settingIndexes: number[], columnIndex, settingIndex) => {
      if (columnIndex >= 0) {
        settingIndexes[columnIndex] = settingIndex;
      }
      return settingIndexes;
    },
    new Array(columns.length).fill(-1),
  );
}
