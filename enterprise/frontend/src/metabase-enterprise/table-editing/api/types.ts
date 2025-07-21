import type { TableId } from "metabase-types/api";
import type { DatasetColumn, RowValue } from "metabase-types/api/dataset";

export enum TableActionId {
  CreateRow = "data-grid.row/create",
  UpdateRow = "data-grid.row/update",
  DeleteRow = "data-grid.row/delete",
  Undo = "data-editing/undo",
  Redo = "data-editing/redo",
}

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type TableEditingActionScope = { "table-id": TableId };

type ExecuteOutput<Op extends "created" | "updated" | "deleted"> = {
  op: Op;
  row: RowCellsWithPkValue;
  "table-id": TableId;
};

export type TableInsertRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: TableEditingActionScope;
};

export type TableInsertRowsResponse = {
  outputs: ExecuteOutput<"created">[];
};

export type TableUpdateRowsRequest = {
  inputs: RowCellsWithPkValue[];
  params: RowCellsWithPkValue;
  scope?: TableEditingActionScope;
};

export type TableUpdateRowsResponse = {
  outputs: ExecuteOutput<"updated">[];
};

export type TableDeleteRowsRequest = {
  inputs: RowCellsWithPkValue[];
  scope?: TableEditingActionScope;
  params?: { "delete-children"?: boolean };
};

export type TableDeleteRowsResponse = {
  outputs: ExecuteOutput<"deleted">[];
};

export type TableUndoRedoRequest = {
  tableId: TableId;
  scope?: TableEditingActionScope;
};

export type TableUndoRedoResponse = {
  outputs?: ExecuteOutput<"created" | "updated" | "deleted">[];
};

export enum ActionFormInputType {
  Text = "text",
  Textarea = "textarea",
  Date = "date",
  DateTime = "datetime",
  Dropdown = "dropdown",
}

export type ActionFormParameter = {
  id: string;
  display_name: string;
  input_type: ActionFormInputType;
  semantic_type?: string;
  optional?: boolean;
  nullable?: boolean;
  readonly?: boolean;
  field_id?: number;
  human_readable_field_id?: number;
  database_default?: string;
  value?: RowValue;
};
