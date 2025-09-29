import type { IconName } from "metabase/ui";
import type { DatasetColumn } from "metabase-types/api";

export type ColumnItem = {
  name: string;
  enabled: boolean;
  icon: IconName;
  column: DatasetColumn;
  columnSettingIndex: number;
};
