import type {
  ConcreteTableId,
  DatasetColumn,
  ParametersForActionExecution,
  RowValue,
  TableId,
  WritebackActionId,
} from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type RowPkValue = string | number;

export type CellUniqKey = string;

export type TableEditingScope =
  | { "table-id": ConcreteTableId }
  | { "dashcard-id": number };

type ExecuteOutput<Op extends "created" | "updated" | "deleted"> = {
  op: Op;
  row: RowCellsWithPkValue;
  "table-id": TableId;
};

export type TableInsertRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
};

export type TableInsertRowsResponse = {
  outputs: ExecuteOutput<"created">[];
};

export type TableUpdateRowsRequest = {
  inputs: RowCellsWithPkValue[];
  params: Record<DatasetColumn["name"], RowValue>;
  scope?: TableEditingScope;
};

export type TableUpdateRowsResponse = {
  outputs: ExecuteOutput<"updated">[];
};

export type TableDeleteRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
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
  scope?: TableEditingScope;
};

export type TableOperation = [string, Record<string, RowValue>];

export type TableUndoRedoResponse = {
  outputs?: ExecuteOutput<"created" | "updated" | "deleted">[];
};

export type TableExecuteActionRequest = {
  actionId: WritebackActionId;
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
  scope: TableEditingScope;
  input?: Record<string, unknown>;
};

export enum ActionFormParameterType {
  Text = "type/Text",
  Number = "type/Number",
  Date = "type/Date",
  DateTime = "type/DateTime",
  Integer = "type/Integer",
  BigInteger = "type/BigInteger",
}

export type ActionFormParameter = {
  id: string;
  display_name: string;
  type: ActionFormParameterType;
  semantic_type?: string;
  optional?: boolean;
  nullable?: boolean;
  readonly?: boolean;
  field_id?: number;
  fk_target_field_id?: number;
};

export type DescribeActionFormResponse = {
  title: string;
  parameters: ActionFormParameter[];
};
