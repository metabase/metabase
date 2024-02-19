import * as Lib from "metabase-lib";
import { getColumnIcon } from "metabase/common/utils/columns";
import type { DatasetColumn } from "metabase-types/api";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { getSettingIndexes } from "../utils";
import type { ColumnSetting, EditWidgetData } from "../types";
import type { ColumnItem, DragColumnProps } from "./types";

export function getColumnItems(
  query: Lib.Query,
  stageIndex: number,
  legacyColumns: DatasetColumn[],
  settings: ColumnSetting[],
): ColumnItem[] {
  const columns = legacyColumns.map(column =>
    Lib.fromLegacyColumn(query, stageIndex, column),
  );

  const settingIndexes = getSettingIndexes(
    query,
    stageIndex,
    columns,
    settings,
  );

  return columns.map((column, columnIndex) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const legacyColumn = legacyColumns[columnIndex];
    const settingIndex = settingIndexes[columnIndex];
    const setting = settings[settingIndex];

    return {
      name: columnInfo.name,
      fieldRef: Lib.legacyRef(query, stageIndex, column),
      enabled: setting.enabled,
      icon: getColumnIcon(column),
      column: legacyColumn,
      setting,
      settingIndex,
    };
  });
}

export const moveColumnInSettings = (
  columnItems: ColumnItem[],
  settings: ColumnSetting[],
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
