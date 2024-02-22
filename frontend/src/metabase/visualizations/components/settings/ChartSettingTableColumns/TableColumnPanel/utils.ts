import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import { findColumnSettingIndexesForColumns } from "metabase-lib/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import type { EditWidgetData } from "../types";

import type { ColumnItem, DragColumnProps } from "./types";

export function getColumnItems(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): ColumnItem[] {
  const settingIndexByColumnIndex = findColumnSettingIndexesForColumns(
    query,
    stageIndex,
    columns,
    columnSettings,
  );

  const columnItems = columns.map((datasetColumn, columnIndex) => {
    const column = Lib.fromLegacyColumn(query, stageIndex, datasetColumn);
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const columnSettingIndex = settingIndexByColumnIndex[columnIndex];
    const columnSetting = columnSettings[columnSettingIndex];

    return {
      name: columnInfo.name,
      fieldRef: Lib.legacyRef(query, stageIndex, column),
      enabled: columnSetting ? columnSetting.enabled : true,
      icon: getColumnIcon(column),
      column: datasetColumn,
      columnSettingIndex,
    };
  });

  return [
    ...columnItems
      .filter(({ columnSettingIndex }) => columnSettingIndex >= 0)
      .sort((a, b) => a.columnSettingIndex - b.columnSettingIndex),
    ...columnItems.filter(({ columnSettingIndex }) => columnSettingIndex < 0),
  ];
}

export function toggleColumnInSettings(
  { name, fieldRef, columnSettingIndex }: ColumnItem,
  columnSettings: TableColumnOrderSetting[],
  isEnabled: boolean,
): TableColumnOrderSetting[] {
  const newSettings = [...columnSettings];

  if (columnSettingIndex >= 0) {
    const setting = newSettings[columnSettingIndex];
    newSettings[columnSettingIndex] = { ...setting, enabled: isEnabled };
  } else {
    newSettings.push({ name, fieldRef, enabled: isEnabled });
  }

  return newSettings;
}

export const moveColumnInSettings = (
  columnItems: ColumnItem[],
  columnSettings: TableColumnOrderSetting[],
  { oldIndex, newIndex }: DragColumnProps,
) => {
  const adjustedOldIndex = columnItems[oldIndex].columnSettingIndex;
  const adjustedNewIndex = columnItems[newIndex].columnSettingIndex;

  // delete a setting from the old index and put it to the new index, shifting all elements
  const newSettings = [...columnSettings];
  newSettings.splice(
    adjustedNewIndex,
    0,
    newSettings.splice(adjustedOldIndex, 1)[0],
  );

  return newSettings;
};

export function getEditWidgetData({ column }: ColumnItem): EditWidgetData {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(column) },
  };
}
