import {
  DatasetColumn,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";
import * as Lib from "metabase-lib";

export interface ColumnSetting extends TableColumnOrderSetting {
  fieldRef: FieldReference;
}

export interface ColumnSettingItem {
  enabled: boolean;
  metadataColumn?: Lib.ColumnMetadata;
  datasetColumn: DatasetColumn;
  columnSettingIndex: number;
}

export interface ColumnMetadataItem {
  column: Lib.ColumnMetadata;
  name: string;
  displayName: string;
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
