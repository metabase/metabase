import type { Table, TableId } from "metabase-types/api";

export type TableSelection = {
  tableId: TableId | undefined;
  alias: string;
};

export type TableOption = {
  table: Table;
  value: string;
  label: string;
};
