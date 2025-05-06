import type {
  ConcreteTableId,
  DatasetColumn,
  RowValue,
} from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type RowPkValue = string | number;

export type CellUniqKey = string;

export type TableEditingScope =
  | { "table-id": ConcreteTableId }
  | { "dashcard-id": number };

export type TableInsertRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
};

export type TableInsertRowsResponse = {
  "created-rows": Record<string, RowValue>[];
};

export type TableUpdateRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
};

export type TableUpdateRowsResponse = { updated: Record<string, RowValue>[] };

export type TableDeleteRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
  scope?: TableEditingScope;
};

export type TableDeleteRowsResponse = { success: boolean };

export type UpdateCellValueHandlerParams = {
  updatedData: RowCellsWithPkValue;
  rowIndex: number;
  columnName: string;
};

export type UpdatedRowHandlerParams = {
  updatedData: RowCellsWithPkValue;
  rowIndex: number;
};

export type TableUndoRedoRequest = {
  tableId: ConcreteTableId;
  scope?: TableEditingScope;

  /**
   * When true, the API will only return the batch number of the next undo operation
   * without actually performing the undo. This is useful for checking if an undo operation
   * is available before attempting it.
   */
  noOp?: boolean;
};

export type TableOperation = [string, Record<string, RowValue>];

export type TableUndoRedoResponse = {
  batch_num?: number;
  result?: Record<ConcreteTableId, TableOperation[]>;
};
