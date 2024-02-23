import type { IconName } from "metabase/ui";
import { getIconForField } from "metabase-lib/metadata/utils/fields";
import { findColumnSettingIndexesForColumns } from "metabase-lib/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import type { EditWidgetData } from "../types";

import type { ColumnItem } from "./types";

export function getColumnItems(
  columns: DatasetColumn[],
  originalSettings: TableColumnOrderSetting[],
): ColumnItem[] {
  const originalIndexes = findColumnSettingIndexesForColumns(
    columns,
    originalSettings,
  );

  const updatedIndexes = [...originalIndexes];
  const updatedSettings = [...originalSettings];
  columns.forEach((column, columnIndex) => {
    const columnSettingIndex = originalIndexes[columnIndex];
    if (columnSettingIndex < 0) {
      updatedIndexes[columnIndex] = updatedSettings.length;
      updatedSettings.push({
        name: column.name,
        key: getColumnKey(column),
        fieldRef: column.field_ref,
        enabled: false,
      });
    }
  });

  const columnItems = columns.map((column, columnIndex) => {
    const columnSettingIndex = updatedIndexes[columnIndex];
    const columnSetting = updatedSettings[columnSettingIndex];

    return {
      name: column.name,
      enabled: columnSetting.enabled,
      index: columnSettingIndex,
      icon: getIconForField(column) as IconName,
      column,
      columnSetting,
    };
  });

  return columnItems.sort((a, b) => a.index - b.index);
}

export function toggleColumnInSettings(
  { index, columnSetting }: ColumnItem,
  columnItems: ColumnItem[],
  isEnabled: boolean,
): TableColumnOrderSetting[] {
  const newSettings = columnItems.map(({ columnSetting }) => columnSetting);
  newSettings[index] = { ...columnSetting, enabled: isEnabled };
  return newSettings;
}

export const moveColumnInSettings = (
  columnItems: ColumnItem[],
  oldIndex: number,
  newIndex: number,
) => {
  // delete a setting from the old index and put it to the new index, shifting all elements
  const newSettings = columnItems.map(({ columnSetting }) => columnSetting);
  newSettings.splice(newIndex, 0, newSettings.splice(oldIndex, 1)[0]);
  return newSettings;
};

export function getEditWidgetData({ column }: ColumnItem): EditWidgetData {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(column) },
  };
}
