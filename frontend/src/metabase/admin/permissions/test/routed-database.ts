import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

const ROUTED_DATABASE_ID = 2;

export const ROUTED_DATABASE = createMockDatabase({
  id: ROUTED_DATABASE_ID,
  name: "Routed Postgres",
  engine: "postgres",
  features: ["database-routing"],
  router_user_attribute: "role",
  tables: [
    createMockTable({
      id: 20,
      db_id: ROUTED_DATABASE_ID,
      schema: "public",
      name: "ORDERS",
      display_name: "Orders",
    }),
  ],
});
