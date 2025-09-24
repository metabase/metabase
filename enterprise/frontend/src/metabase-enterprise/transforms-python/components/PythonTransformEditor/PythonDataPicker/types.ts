import type { ConcreteTableId } from "metabase-types/api";

export type TableSelection = {
  tableId: ConcreteTableId | undefined;
  alias: string;
};
