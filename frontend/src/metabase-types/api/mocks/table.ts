import { Table, Schema, ForeignKey } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks/field";

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
  origin: createMockField({ id: 1 }),
  origin_id: 1,
  destination: createMockField({ id: 2 }),
  destination_id: 2,
  relationship: "",
  ...opts,
});
