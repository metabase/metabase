import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
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
  legacyColumns: DatasetColumn[],
  settings: TableColumnOrderSetting[],
): ColumnItem[] {
  const columns = legacyColumns.map(column =>
    Lib.fromLegacyColumn(query, stageIndex, column),
  );

  const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    settings.map(setting => setting.fieldRef),
  );

  const settingIndexes = columnIndexes.reduce(
    (settingIndexes: number[], columnIndex, settingIndex) => {
      settingIndexes[columnIndex] = settingIndex;
      return settingIndexes;
    },
    [],
  );

  return columns.map((column, columnIndex) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const legacyColumn = legacyColumns[columnIndex];
    const settingIndex = settingIndexes[columnIndex];
    const setting = settings[settingIndex];

    return {
      name: columnInfo.name,
      fieldRef: Lib.legacyRef(query, stageIndex, column),
      enabled: setting ? setting.enabled : true,
      icon: getColumnIcon(column),
      column: legacyColumn,
      settingIndex,
    };
  });
}

export function toggleColumnInSettings(
  { name, fieldRef, settingIndex }: ColumnItem,
  settings: TableColumnOrderSetting[],
  isEnabled: boolean,
): TableColumnOrderSetting[] {
  const newSettings = [...settings];

  if (settingIndex >= 0) {
    const setting = newSettings[settingIndex];
    newSettings[settingIndex] = { ...setting, enabled: isEnabled };
  } else {
    newSettings.push({ name, fieldRef, enabled: isEnabled });
  }

  return newSettings;
}

export const moveColumnInSettings = (
  columnItems: ColumnItem[],
  settings: TableColumnOrderSetting[],
  { oldIndex, newIndex }: DragColumnProps,
) => {
  const adjustedOldIndex = columnItems[oldIndex].settingIndex;
  const adjustedNewIndex = columnItems[newIndex].settingIndex;

  const newSettings = [...settings];
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
