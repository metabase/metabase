import * as Lib from "metabase-lib";
import { getColumnIcon } from "metabase/common/utils/columns";
import type { DatasetColumn } from "metabase-types/api";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type { ColumnSetting, EditWidgetData } from "../types";
import type { ColumnItem } from "./types";

export function getColumnItems(
  query: Lib.Query,
  stageIndex: number,
  legacyColumns: DatasetColumn[],
  settings: ColumnSetting[],
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
      enabled: setting.enabled,
      icon: getColumnIcon(column),
      column: legacyColumn,
      setting,
      settingIndex,
    };
  });
}

export function getEditWidgetData({ column }: ColumnItem): EditWidgetData {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(column) },
  };
}
