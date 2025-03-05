import { checkNotNull } from "metabase/lib/types";
import type { TableData } from "metabase-types/api";

export const getValidatedTableId = (
  maybeTableId: TableData["table_id"],
): number => {
  const tableId = checkNotNull(maybeTableId);
  if (typeof tableId !== "number") {
    throw new Error("Invalid table id. It should be a number");
  }

  return tableId;
};
