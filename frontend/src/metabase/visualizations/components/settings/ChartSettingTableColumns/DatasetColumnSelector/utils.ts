import * as Lib from "metabase-lib";
import { getColumnIcon } from "metabase/common/utils/columns";
import type { DatasetColumn } from "metabase-types/api";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type { ColumnSetting, EditWidgetData } from "../types";
import type { ColumnItem } from "./types";

export function getColumnItems(
  query: Lib.Query,
  stageIndex: number,
  columns: DatasetColumn[],
  settings: ColumnSetting[],
): ColumnItem[] {
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
    const settingIndex = settingIndexes[columnIndex];
    const setting = settings[settingIndex];

    return {
      name: "",
      enabled: setting?.enabled ?? true,
      icon: getColumnIcon(Lib.fromLegacyColumn(query, stageIndex, column)),
      column,
      setting,
    };
  });
}

export const getEditWidgetData = ({ column }: ColumnItem): EditWidgetData => {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(column) },
  };
};
