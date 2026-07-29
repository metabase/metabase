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

// The library pane is rendered from PLUGIN_LIBRARY.DataReferenceLibraryPane
// (see DataReference), so it is intentionally absent from PANES.
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
  // The database the current query targets, used by the Library pane to list
  // its tables first. Not part of the navigation stack.
  queryDatabaseId?: DatabaseId;
} & TItem;

export type DataReferenceItem =
  | DataReferenceDatabaseItem
  | DataReferenceLibraryItem
  | DataReferenceSchemaItem
  | DataReferenceTableItem
  | DataReferenceQuestionItem
  | DataReferenceFieldItem;

export type DataReferenceDatabaseItem = {
  type: "database";
  id: DatabaseId;
};

export type DataReferenceLibraryItem = {
  type: "library";
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
