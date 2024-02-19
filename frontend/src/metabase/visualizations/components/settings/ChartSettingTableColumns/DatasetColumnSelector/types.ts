import type { IconName } from "metabase/ui";
import type { DatasetColumn, FieldReference } from "metabase-types/api";

export type ColumnItem = {
  name: string;
  fieldRef: FieldReference;
  enabled: boolean;
  icon: IconName;
  column: DatasetColumn;
  settingIndex: number;
};

export type DragColumnProps = {
  oldIndex: number;
  newIndex: number;
};
