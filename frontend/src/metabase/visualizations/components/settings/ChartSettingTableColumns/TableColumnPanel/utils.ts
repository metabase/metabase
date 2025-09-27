import { getColumnIcon } from "metabase/common/utils/columns";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import * as Lib from "metabase-lib";
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
  tc: ContentTranslationFunction,
  isShowingDetailsOnlyColumns: boolean,
): ColumnItem[] {
  const columnIndexes = findColumnIndexesForColumnSettings(
    columns,
    columnSettings,
  );

  return columnSettings.reduce(
    (columnItems: ColumnItem[], columnSetting, columnSettingIndex) => {
      const columnIndex = columnIndexes[columnSettingIndex];
      const column = columns[columnIndex];

      if (
        isShowingDetailsOnlyColumns ||
        column.visibility_type !== "details-only"
      ) {
        columnItems.push({
          name: column.name,
          enabled: columnSetting.enabled,
          icon: getColumnIcon(Lib.legacyColumnTypeInfo(column)),
          column: { ...column, display_name: tc(column.display_name) },
          columnSettingIndex,
        });
      }

      return columnItems;
    },
    [],
  );
}

export function toggleColumnInSettings(
  columnSettings: TableColumnOrderSetting[],
  { columnSettingIndex }: ColumnItem,
  isEnabled: boolean,
): TableColumnOrderSetting[] {
  const newSettings = [...columnSettings];
  newSettings[columnSettingIndex] = {
    ...columnSettings[columnSettingIndex],
    enabled: isEnabled,
  };
  return newSettings;
}

export const moveColumnInSettings = (
  columnSettings: TableColumnOrderSetting[],
  columnItems: ColumnItem[],
  oldIndex: number,
  newIndex: number,
) => {
  const oldSettingIndex = columnItems[oldIndex].columnSettingIndex;
  const newSettingIndex = columnItems[newIndex].columnSettingIndex;

  // delete a setting from the old index and put it to the new index, shifting all elements
  const newSettings = [...columnSettings];
  newSettings.splice(
    newSettingIndex,
    0,
    newSettings.splice(oldSettingIndex, 1)[0],
  );
  return newSettings;
};

export function getEditWidgetData({ column }: ColumnItem): EditWidgetData {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(column) },
  };
}
