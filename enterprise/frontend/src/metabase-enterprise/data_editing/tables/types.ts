import type {
  ConcreteTableId,
  DatasetColumn,
  RowValue,
  RowValues,
} from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type TableInsertRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
};

export type TableInsertRowsResponse = { "created-rows": RowValues[] };

export type TableUpdateRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
};

export type TableUpdateRowsResponse = { "rows-updated": number };

export type TableDeleteRowsRequest = {
  tableId: ConcreteTableId;
  rows: RowCellsWithPkValue[];
};

export type TableDeleteRowsResponse = { success: boolean };
