import type * as Lib from "metabase-lib";
import type {
  CardId,
  ConcreteTableId,
  DatabaseId,
  SchemaName,
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

export type DataReferenceTableFieldItem = {
  type: "field";
  tableId: ConcreteTableId;
  columnIndex: number;
};

export type DataReferenceCardFieldItem = {
  type: "field";
  cardId: CardId;
  columnIndex: number;
};

export type DataReferenceFieldItem =
  | DataReferenceTableFieldItem
  | DataReferenceCardFieldItem;

export type ColumnListInfo = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
};
