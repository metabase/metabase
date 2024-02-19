import _ from "underscore";
import type {
  DatasetColumn,
  DatasetData,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";
import * as Lib from "metabase-lib";
import Dimension from "metabase-lib/Dimension";
import { normalize } from "metabase-lib/queries/utils/normalize";

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
  const normalizedFieldRef = fieldRef ? normalize(fieldRef) : undefined;
  // first try to find by fieldRef
  if (normalizedFieldRef != null) {
    let columnIndex: number;

    if (!query) {
      // TODO: remove once migration is completed
      // throw new Error("query is required to find column index");

      columnIndex = legacyFindColumnIndexForColumnSetting(
        columns,
        normalizedFieldRef,
      );
    } else {
      const stageIndex = -1;
      [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
        query,
        stageIndex,
        // we make a structured clone to unfreeze objects as
        // cljs adds a unique id to every object
        // and it's not possible with frozen objects
        structuredClone(columns),
        [structuredClone(normalizedFieldRef)],
      );
    }

    if (columnIndex >= 0) {
      return columnIndex;
    }
  }
  // if that fails, find by column name
  return _.findIndex(columns, col => col.name === columnSetting.name);
}

function legacyFindColumnIndexForColumnSetting(
  columns: DatasetColumn[],
  normalizedFieldRef: FieldReference,
) {
  const dimension = Dimension.parseMBQL(normalizedFieldRef);
  const index = dimension
    ? _.findIndex(columns, col =>
        dimension.isSameBaseDimension(fieldRefForColumn(col)),
      )
    : -1;

  return index;
}

export function findColumnSettingIndexForColumn(
  query: Lib.Query,
  columnSettings: TableColumnOrderSetting[],
  column: DatasetColumn,
) {
  // ignore settings without fieldRef but preserve indexes
  const items = columnSettings.flatMap((item, settingIndex) => {
    const fieldRef = item.fieldRef ? normalize(item.fieldRef) : null;
    return fieldRef ? [{ fieldRef, settingIndex }] : [];
  });

  // first try to find by fieldRef
  const stageIndex = -1;
  const itemIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    [column],
    items.map(({ fieldRef }) => fieldRef),
  );

  const itemIndex = itemIndexes.find(index => index >= 0);

  if (itemIndex != null) {
    return items[itemIndex].settingIndex;
  }

  return -1;
}
