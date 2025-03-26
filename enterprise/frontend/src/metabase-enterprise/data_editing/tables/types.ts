import type {
  ConcreteTableId,
  DatasetColumn,
  RowValue,
} from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type TableInsertRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
};

export type TableInsertRowsResponse = {
  "created-rows": Record<string, RowValue>[];
};

export type TableUpdateRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
  primaryKeyColumnName: string;
};

export type TableUpdateRowsResponse = { updated: Record<string, RowValue>[] };

export type TableDeleteRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
  primaryKeyColumnName: string;
};

export type TableDeleteRowsResponse = { success: boolean };

export type UpdatedRowCellsHandlerParams = {
  data: Record<DatasetColumn["name"], RowValue>;
  rowIndex: number;
};
