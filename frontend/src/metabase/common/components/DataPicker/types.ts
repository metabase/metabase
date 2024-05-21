import type {
  CardId,
  Collection,
  DatabaseId,
  SchemaName,
  TableId,
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

export type NotebookDataPickerFolderItem =
  | CollectionItem
  | DatabaseItem
  | SchemaItem;

export type NotebookDataPickerValueItem =
  | TableItem
  | QuestionItem
  | ModelItem
  | MetricItem;

export type DataPickerModalOptions = EntityPickerModalOptions &
  QuestionPickerOptions;
