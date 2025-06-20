import type {
  ActionItem,
  CollectionItem,
  DatabaseItem,
  ModelItem,
  SchemaItem,
  TableItem,
} from "metabase/common/components/DataPicker";
import type {
  CardId,
  CollectionId,
  DatabaseId,
  SchemaName,
  TableActionId,
  TableId,
  WritebackActionId,
} from "metabase-types/api";

export type CollectionListItem = CollectionItem & {
  position: number | null;
};

export type TableActionPickerValue = {
  id: TableActionId;
  name: string;
  model: "action";
  db_id: DatabaseId;
  schema: SchemaName;
  table_id: TableId;
};

export type TableActionPickerFolderItem = DatabaseItem | SchemaItem | TableItem;
export type TableActionPickerStatePath = [
  DatabaseId | undefined,
  SchemaName | undefined,
  TableId | undefined,
  TableActionId | undefined,
];
export type TableActionPickerItem = TableActionPickerFolderItem | ActionItem;

export type ModelActionPickerValue = {
  id: WritebackActionId;
  name: string;
  model: "action";
  model_id: CardId;
  collection_id?: CollectionId;
};

export type ModelActionPickerFolderItem = CollectionItem | ModelItem;
export type ModelActionPickerStatePath = [
  CollectionId | undefined,
  CardId | undefined,
  TableActionId | undefined,
];
export type ModelActionPickerItem = ModelActionPickerFolderItem | ActionItem;
