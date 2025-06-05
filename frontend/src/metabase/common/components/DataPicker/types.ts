import type {
  CardId,
  Collection,
  CollectionId,
  DashboardId,
  DataGridWritebackActionId,
  DatabaseId,
  SchemaName,
  TableActionId,
  TableId,
  WritebackActionId,
} from "metabase-types/api";

import type { EntityPickerModalOptions } from "../EntityPicker";
import type { QuestionPickerOptions } from "../QuestionPicker";

export type CollectionItem = {
  id: Collection["id"];
  name: Collection["name"];
  model: "collection";
};

export type DatabaseItem = {
  id: DatabaseId;
  name: string;
  model: "database";
};

export type SchemaItem = {
  id: SchemaName;
  dbId: DatabaseId;
  dbName: string | undefined;
  isOnlySchema: boolean;
  name: string;
  model: "schema";
};

export type TableItem = {
  id: TableId;
  name: string;
  model: "table";
};

export type QuestionItem = {
  id: CardId;
  name: string;
  model: "card";
};

export type DashboardItem = {
  id: DashboardId;
  name: string;
  model: "dashboard";
};

export type ModelItem = {
  id: CardId;
  name: string;
  model: "dataset";
};

export type MetricItem = {
  id: CardId;
  name: string;
  model: "metric";
};

export type ActionItem = {
  id: DataGridWritebackActionId;
  name: string;
  model: "action";
};

export type TableActionPickerValue = {
  id: TableActionId;
  name: string;
  model: "action";
  db_id: DatabaseId;
  schema: SchemaName;
  table_id: TableId;
};

export type ModelActionPickerValue = {
  id: WritebackActionId;
  name: string;
  model: "action";
  model_id: CardId;
  collection_id?: CollectionId;
};

export type TablePickerValue = {
  id: TableId;
  name: string;
  model: "table";
  db_id: DatabaseId;
  schema: SchemaName;
};

export type DataPickerValue =
  | TablePickerValue
  | QuestionItem
  | ModelItem
  | MetricItem;

export type DataPickerFolderItem =
  | CollectionItem
  | DatabaseItem
  | SchemaItem
  | DashboardItem;

export type DataPickerValueItem =
  | TableItem
  | QuestionItem
  | ModelItem
  | MetricItem;

export type DataPickerItem = DataPickerFolderItem | DataPickerValueItem;

export type DataPickerModalOptions = EntityPickerModalOptions &
  QuestionPickerOptions;

export type TablePickerStatePath = [
  DatabaseId | undefined,
  SchemaName | undefined,
  TableId | undefined,
];

export type TableActionPickerFolderItem = DatabaseItem | SchemaItem | TableItem;
export type TableActionPickerStatePath = [
  DatabaseId | undefined,
  SchemaName | undefined,
  TableId | undefined,
  TableActionId | undefined,
];
export type TableActionPickerItem = TableActionPickerFolderItem | ActionItem;

export type ModelActionPickerFolderItem = CollectionItem | ModelItem;
export type ModelActionPickerStatePath = [
  CollectionId | undefined,
  CardId | undefined,
  TableActionId | undefined,
];
export type ModelActionPickerItem = ModelActionPickerFolderItem | ActionItem;
