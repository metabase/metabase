import type {
  Card,
  Database,
  NormalizedSchema,
  Table,
} from "metabase-types/api";

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

// TODO: add QuestionPickerItem
// TODO: add ModelPickerItem if question is insufficient
export type NotebookDataPickerItem =
  | DatabaseItem
  | SchemaItem
  | TableItem
  | QuestionItem
  | ModelItem;

export type Value = Pick<NotebookDataPickerItem, "id" | "model">;
