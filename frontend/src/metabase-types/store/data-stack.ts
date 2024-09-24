import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";

type DatabaseStackItem = {
  type: "database";
  item: Database;
};

type TableStackItem = {
  type: "table";
  item: Table;
};

type SchemaStackItem = {
  type: "schema";
  item: Schema;
};

type QuestionStackItem = {
  type: "question";
  item: Question;
};

type FieldStackItem = {
  type: "field";
  item: Field;
};

export type DataReferenceStackItem =
  | DatabaseStackItem
  | TableStackItem
  | SchemaStackItem
  | QuestionStackItem
  | FieldStackItem;

export type DataReferenceStack = DataReferenceStackItem[];
