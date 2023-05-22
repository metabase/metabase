import { Table, Schema, ForeignKey } from "metabase-types/api";

export const createMockTable = (opts?: Partial<Table>): Table => {
  return {
    id: 1,
    db_id: 1,
    display_name: "Table",
    name: "table",
    schema: "public",
    description: null,
    active: true,
    visibility_type: null,
    field_order: "database",
    initial_sync_status: "complete",
    ...opts,
  };
};

export const createMockSchema = (opts?: Partial<Schema>): Schema => ({
  id: "1",
  name: "Schema 1",
  ...opts,
});

export const createMockForeignKey = (
  opts?: Partial<ForeignKey>,
): ForeignKey => ({
  origin_id: 1,
  destination_id: 1,
  relationship: "",
  ...opts,
});
