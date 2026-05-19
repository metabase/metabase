import type { DatasetColumn, IconName } from "metabase-types/api";

export type ColumnItem = {
  name: string;
  enabled: boolean;
  icon: IconName;
  column: DatasetColumn;
  columnSettingIndex: number;
};
