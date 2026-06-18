import type { TableIndex } from "metabase-types/api";

export const createMockTableIndex = (
  opts?: Partial<TableIndex>,
): TableIndex => ({
  id: 1,
  transform_id: 1,
  index_name: "btree",
  structured: {
    kind: "btree",
    name: "btree",
    columns: [{ name: "id" }],
  },
  status: "pending",
  error_message: null,
  created_by: 1,
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",
  last_executed_at: null,
  ...opts,
});
