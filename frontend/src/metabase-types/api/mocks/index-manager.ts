import type { TableIndexEntry, TableIndexRequest } from "metabase-types/api";

export const createMockTableIndexRequest = (
  opts?: Partial<TableIndexRequest>,
): TableIndexRequest => ({
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

export const createMockTableIndexEntry = (
  opts?: Partial<TableIndexEntry>,
): TableIndexEntry => ({
  metabase_managed: true,
  present_in_warehouse: true,
  name: "btree",
  kind: "btree",
  key_columns: ["id"],
  include_columns: [],
  is_unique: false,
  is_primary: false,
  is_valid: true,
  partial_predicate: null,
  access_method: null,
  request: createMockTableIndexRequest(),
  ...opts,
});
