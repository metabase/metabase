import type { IconName } from "metabase/ui";
import type { DatasetColumn } from "metabase-types/api";
import type { ColumnSetting } from "../types";

export type ColumnItem = {
  name: string;
  enabled: boolean;
  icon: IconName;
  column: DatasetColumn;
  setting?: ColumnSetting;
};
