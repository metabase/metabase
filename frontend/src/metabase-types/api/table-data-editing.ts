import type {
  ConcreteTableId,
  DatasetColumn,
  ParametersForActionExecution,
  RowValue,
  TableId,
  WritebackActionId,
} from "metabase-types/api";

export type RowPkValue = string | number;

export type CellUniqKey = string;

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

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
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
};

export type TableUpdateRowsResponse = {
  outputs: ExecuteOutput<"updated">[];
};

export type TableDeleteRowsRequest = {
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
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

export type TableUndoRedoResponse = {
  outputs?: ExecuteOutput<"created" | "updated" | "deleted">[];
};

export type TableExecuteActionRequest = {
  actionId: WritebackActionId;
  parameters: ParametersForActionExecution;
};

export type TableExecuteActionResponse = {
  "rows-affected": number;
};
