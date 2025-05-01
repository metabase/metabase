<<<<<<< HEAD
import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";
||||||| parent of c2ae5a76fa2 (Support column name translations)
=======
import type { ContentTranslationFunction } from "metabase/i18n/types";
>>>>>>> c2ae5a76fa2 (Support column name translations)
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
<<<<<<< HEAD
  tc: ContentTranslationFunction = _.identity,
||||||| parent of c2ae5a76fa2 (Support column name translations)
=======
  tc?: ContentTranslationFunction,
>>>>>>> c2ae5a76fa2 (Support column name translations)
): ColumnItem[] {
  const columnIndexes = findColumnIndexesForColumnSettings(
    columns,
    columnSettings,
  );

  return columnSettings.map((columnSetting, columnSettingIndex) => {
    const columnIndex = columnIndexes[columnSettingIndex];
    const column = columns[columnIndex];

    column.display_name = tc ? tc(column.display_name) : column.display_name;

    return {
      name: tc ? column.name : column.name,
      enabled: columnSetting.enabled,
      index: columnSettingIndex,
      icon: getIconForField(column) as IconName,
      column: { ...column, display_name: tc(column.display_name) },
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
