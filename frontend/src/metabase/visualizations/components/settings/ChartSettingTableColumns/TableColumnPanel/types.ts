import type { IconName } from "metabase/ui";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

export type ColumnItem = {
  name: string;
  enabled: boolean;
  index: number;
  icon: IconName;
  column: DatasetColumn;
  columnSetting: TableColumnOrderSetting;
};

export type DragColumnProps = {
  oldIndex: number;
  newIndex: number;
};
