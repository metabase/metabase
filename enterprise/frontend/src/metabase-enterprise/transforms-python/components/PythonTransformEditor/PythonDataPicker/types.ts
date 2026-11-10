import type { TableId } from "metabase-types/api";

export type TableSelection = {
  tableId: TableId | undefined;
  alias: string;
};
