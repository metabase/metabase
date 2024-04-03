import type {
  Card,
  Collection,
  Database,
  NormalizedSchema,
  Table,
} from "metabase-types/api";

export type CollectionItem = {
  id: Collection["id"];
  name: Collection["name"];
  model: "collection";
};

export type DatabaseItem = {
  id: Database["id"];
  name: Database["name"];
  model: "database";
};

export type SchemaItem = {
  id: NormalizedSchema["id"];
  name: NormalizedSchema["name"];
  model: "schema";
};

export type TableItem = {
  id: Table["id"];
  name: Table["name"];
  model: "table";
};

export type QuestionItem = {
  id: Card["id"];
  name: Card["name"];
  model: "card";
};

export type ModelItem = {
  id: Card["id"];
  name: Card["name"];
  model: "dataset";
};

export type TablePickerValue = {
  id: Table["id"];
  db_id: Table["db_id"];
  schema: Table["schema"];
};

export type NotebookDataPickerFolderItem =
  | CollectionItem
  | DatabaseItem
  | SchemaItem;

export type NotebookDataPickerValueItem = TableItem | QuestionItem | ModelItem;
