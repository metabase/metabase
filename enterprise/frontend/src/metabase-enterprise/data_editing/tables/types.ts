import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

export type RowCellsWithPkValue = Record<DatasetColumn["name"], RowValue>;

export type TableInsertRowsRequest = {
  tableName: string;
  rows: RowCellsWithPkValue[];
};

export type TableInsertRowsResponse = RowValues[];

export type TableUpdateRowsRequest = {
  tableName: string;
  rows: RowCellsWithPkValue[];
};

export type TableUpdateRowsResponse = RowValues[];

export type TableDeleteRowsRequest = {
  tableName: string;
  rows: RowCellsWithPkValue[];
};

export type TableDeleteRowsResponse = RowValues[];
