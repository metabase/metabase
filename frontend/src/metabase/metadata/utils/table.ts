import type { Table } from "metabase-types/api";

export function isTableReadOnly(table: Pick<Table, "can_write">): boolean {
  return table.can_write === false;
}
