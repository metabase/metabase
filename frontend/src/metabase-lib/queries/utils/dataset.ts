import cloneDeep from "lodash.clonedeep";
import _ from "underscore";

import * as Lib from "metabase-lib";
import Dimension from "metabase-lib/Dimension";
import { normalize } from "metabase-lib/queries/utils/normalize";
import type {
  DatasetColumn,
  DatasetData,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

/**
 * Returns a MBQL field reference (FieldReference) for a given result dataset column
 */
export function fieldRefForColumn(
  column: DatasetColumn,
): FieldReference | null | undefined {
  // NOTE: matching existing behavior of returning the unwrapped base dimension until we understand the implications of changing this
  return (
    column.field_ref &&
    Dimension.parseMBQL(column.field_ref)?.baseDimension().mbql()
  );
}

export function findColumnIndexForColumnSetting(
  columns: DatasetColumn[],
  columnSetting: TableColumnOrderSetting,
  query?: Lib.Query,
) {
  const fieldRef = columnSetting.fieldRef;
  // NOTE: need to normalize field refs because they may be old style [fk->, 1, 2]
  const normalizedFieldRef = normalize(fieldRef);
  // first try to find by fieldRef
  if (normalizedFieldRef != null && query) {
    const stageIndex = -1;
    const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      // we make a deep clone to unfreeze objects as
      // cljs adds a unique id to every object
      // and it's not possible with frozen objects
      cloneDeep(columns),
      [cloneDeep(normalizedFieldRef)],
    );

    if (columnIndex >= 0) {
      return columnIndex;
    }
  }

  // if that fails, find by column name
  return _.findIndex(columns, col => col.name === columnSetting.name);
}

type FieldRefWithIndex = {
  fieldRef: FieldReference;
  originalIndex: number;
};

export function findColumnSettingIndexesForColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const fieldRefs = columnSettings.reduce(
    (fieldRefs: FieldRefWithIndex[], { fieldRef }, originalIndex) => {
      if (fieldRef != null) {
        fieldRefs.push({ fieldRef, originalIndex });
      }
      return fieldRefs;
    },
    [],
  );

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
