import type {
  Card,
  Collection,
  Database,
  DatabaseListQuery,
  NormalizedSchema,
  SchemaListQuery,
  Table,
  TableListQuery,
} from "metabase-types/api";

import type { PickerState } from "../EntityPicker";

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

export type NotebookDataPickerFolderItem =
  | CollectionItem
  | DatabaseItem
  | SchemaItem;

export type Value = {
  id: Table["id"];
  db_id: Table["db_id"];
  schema?: Table["schema"];
};

export type TablePickerFolderItem = DatabaseItem | SchemaItem;

export type NotebookDataPickerValueItem = TableItem | QuestionItem | ModelItem;

export type NotebookDataPickerItem =
  | NotebookDataPickerFolderItem
  | NotebookDataPickerValueItem;

export type NotebookDataPickerModel = NotebookDataPickerItem["model"];

// export type Value = NotebookDataPickerValueItem["id"];

export type PathEntry<Model extends NotebookDataPickerFolderItem["model"]> =
  PickerState<Model, NotebookDataPickerItem, NotebookDataPickerQuery<Model>>;

// TODO
export type NotebookDataPickerQuery<Model> = Model extends "database"
  ? DatabaseListQuery
  : Model extends "schema"
  ? SchemaListQuery
  : TableListQuery;

// export type NotebookDataPickerQuery =
//   | {
//       model: "table";
//       query: TableListQuery;
//     }
//   | {
//       model: "schema";
//       query: SchemaListQuery;
//     }
//   | {
//       model: "database";
//       query: DatabaseListQuery;
//     };
