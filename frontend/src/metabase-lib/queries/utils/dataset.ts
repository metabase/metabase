import * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  DatasetData,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

type FieldRefWithIndex = {
  fieldRef: FieldReference;
  originalIndex: number;
};

function getFieldRefsWithIndexes(columnSettings: TableColumnOrderSetting[]) {
  return columnSettings.reduce(
    (fieldRefs: FieldRefWithIndex[], { fieldRef }, originalIndex) => {
      if (fieldRef != null) {
        fieldRefs.push({ fieldRef, originalIndex });
      }
      return fieldRefs;
    },
    [],
  );
}

export function findColumnIndexesForColumnSettings(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const fieldRefs = getFieldRefsWithIndexes(columnSettings);
  const columnIndexByFieldRefIndex = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    fieldRefs.map(({ fieldRef }) => fieldRef),
  );
  return columnIndexByFieldRefIndex.reduce(
    (columnIndexes: number[], columnIndex, fieldRefIndex) => {
      if (columnIndex >= 0) {
        columnIndexes[fieldRefs[fieldRefIndex].originalIndex] = columnIndex;
      }
      return columnIndexes;
    },
    new Array(columnSettings.length).fill(-1),
  );
}

export function findColumnSettingIndexesForColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const fieldRefs = getFieldRefsWithIndexes(columnSettings);
  const columnIndexByFieldRefIndex = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    fieldRefs.map(({ fieldRef }) => fieldRef),
  );
  return columnIndexByFieldRefIndex.reduce(
    (settingIndexes: number[], columnIndex, fieldRefIndex) => {
      if (columnIndex >= 0) {
        settingIndexes[columnIndex] = fieldRefs[fieldRefIndex].originalIndex;
      }
      return settingIndexes;
    },
    new Array(columns.length).fill(-1),
  );
}
