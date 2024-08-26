import type { IconName } from "metabase/ui";
import { getIconForField } from "metabase-lib/v1/metadata/utils/fields";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import type { EditWidgetData } from "../types";

import type { ColumnItem } from "./types";

export function getColumnItems(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): ColumnItem[] {
  const columnIndexes = findColumnIndexesForColumnSettings(
    columns,
    columnSettings,
  );

  return columnSettings.map((columnSetting, columnSettingIndex) => {
    const columnIndex = columnIndexes[columnSettingIndex];
    const column = columns[columnIndex];

    return {
      name: column.name,
      enabled: columnSetting.enabled,
      index: columnSettingIndex,
      icon: getIconForField(column) as IconName,
      column,
      columnSetting,
    };
  });
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
