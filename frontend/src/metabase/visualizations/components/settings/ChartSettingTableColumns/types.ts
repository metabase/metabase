import type {
  DatasetColumn,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";
import type * as Lib from "metabase-lib";
import type { IconProps } from "metabase/ui";

export interface ColumnSetting extends TableColumnOrderSetting {
  fieldRef: FieldReference;
}

export interface ColumnSettingItem {
  enabled: boolean;
  metadataColumn?: Lib.ColumnMetadata;
  datasetColumn: DatasetColumn;
  columnSettingIndex: number;
  icon?: IconProps["name"];
}

export interface ColumnMetadataItem {
  column: Lib.ColumnMetadata;
  name: string;
  displayName: string;
  selected?: boolean;
  isAggregation?: boolean;
  isBreakout?: boolean;
}

export interface ColumnGroupItem {
  columns: ColumnMetadataItem[];
  displayName: string;
  isJoinable: boolean;
}

export interface DragColumnProps {
  oldIndex: number;
  newIndex: number;
}

export interface EditWidgetConfig {
  id: string;
  props: EditWidgetProps;
}

export interface EditWidgetProps {
  initialKey: string;
}
