import { Table } from "metabase-types/api";

export const createMockTable = (opts?: Partial<Table>): Table => {
  return {
    id: 1,
    db_id: 1,
    display_name: "Table",
    name: "table",
    schema: "public",
    description: null,
    visibility_type: "normal",
    ...opts,
  };
};
