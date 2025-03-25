import type {
  ConcreteTableId,
  DatasetColumn,
  Field,
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

export type UpdatedRowCellsHandlerParams = {
  data: Record<DatasetColumn["name"], RowValue>;
  rowIndex: number;
};

export type FieldWithMetadata = Field & {
  database_default?: string;
  database_indexed: boolean;
  database_is_auto_increment: boolean;
  database_is_generated: boolean;
  database_is_nullable: boolean;
  database_required: boolean;
};
