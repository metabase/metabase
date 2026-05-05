import type {
  CardId,
  ConcreteTableId,
  DatabaseId,
  FieldId,
  SchemaName,
  VirtualTableId,
} from "metabase-types/api";

import { DatabasePane } from "./DatabasePane";
import { FieldPane } from "./FieldPane";
import { QuestionPane } from "./QuestionPane";
import { SchemaPane } from "./SchemaPane";
import { TablePane } from "./TablePane";

export const PANES = {
  database: DatabasePane, // lists schemas, tables and models of a database
  schema: SchemaPane, // lists tables of a schema
  table: TablePane, // lists fields of a table
  question: QuestionPane, // lists fields of a question
  field: FieldPane, // field details and metadata
};

export type OnItemClick = (item: DataReferenceItem) => void;
export type DataReferencePaneProps<TItem = unknown> = {
  onClose?: () => void;
  onBack?: () => void;
  onItemClick: OnItemClick;
} & TItem;

export type DataReferenceItem =
  | DataReferenceDatabaseItem
  | DataReferenceSchemaItem
  | DataReferenceTableItem
  | DataReferenceQuestionItem
  | DataReferenceFieldItem;

export type DataReferenceDatabaseItem = {
  type: "database";
  id: DatabaseId;
};

export type DataReferenceSchemaItem = {
  type: "schema";
  schemaName: SchemaName;
  databaseId: DatabaseId;
};

export type DataReferenceTableItem = {
  type: "table";
  id: ConcreteTableId;
};

export type DataReferenceQuestionItem = {
  type: "question";
  id: CardId;
};

export type UniqueFieldId = `${VirtualTableId}:${string}`;

export type DataReferenceFieldItem = {
  type: "field";
  id: FieldId | UniqueFieldId;
};
