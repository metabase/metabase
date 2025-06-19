import type {
  ActionScope,
  ConcreteTableId,
  DatasetColumn,
  ParametersForActionExecution,
  RowValue,
  TableId,
  WritebackActionId,
} from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type RowPkValuesKey = string;

export type CellUniqKey = string;

type ExecuteOutput<Op extends "created" | "updated" | "deleted"> = {
  op: Op;
  row: RowCellsWithPkValue;
  "table-id": TableId;
};

export type TableInsertRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: ActionScope;
};

export type TableInsertRowsResponse = {
  outputs: ExecuteOutput<"created">[];
};

export type TableUpdateRowsRequest = {
  inputs: RowCellsWithPkValue[];
  params: Record<DatasetColumn["name"], RowValue>;
  scope?: ActionScope;
};

export type TableUpdateRowsResponse = {
  outputs: ExecuteOutput<"updated">[];
};

export type TableDeleteRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: ActionScope;
  params?: { "delete-children"?: boolean };
};

export type TableDeleteRowsResponse = {
  outputs: ExecuteOutput<"deleted">[];
};

export type UpdateCellValueHandlerParams = {
  updatedData: RowCellsWithPkValue;
  rowIndex: number;
  columnName: string;
};

export type UpdatedRowHandlerParams = {
  updatedData: RowCellsWithPkValue;
  rowIndex: number;
};

export type UpdatedRowBulkHandlerParams = {
  updatedData: RowCellsWithPkValue;
  rowIndices: number[];
};

export type TableUndoRedoRequest = {
  tableId: ConcreteTableId;
  scope?: ActionScope;
};

export type TableUndoRedoResponse = {
  outputs?: ExecuteOutput<"created" | "updated" | "deleted">[];
};

export type TableExecuteActionRequest = {
  actionId: WritebackActionId | string;
  scope: ActionScope;
  input: ParametersForActionExecution;
  params: ParametersForActionExecution;
};

export type TableExecuteActionResponse = {
  "rows-affected": number;
};

export enum BuiltInTableAction {
  Create = "table.row/create",
  Update = "table.row/update",
  Delete = "table.row/delete",
}

export type DescribeActionFormRequest = {
  action_id: BuiltInTableAction | number;
  scope: ActionScope;
  input?: Record<string, unknown>;
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
};

export type DescribeActionFormResponse = {
  title: string;
  parameters: ActionFormParameter[];
};
