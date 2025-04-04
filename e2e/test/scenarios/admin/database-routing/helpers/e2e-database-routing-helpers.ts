import { QA_POSTGRES_PORT } from "e2e/support/cypress_data";
import type { DatabaseData } from "metabase-types/api";

export function configurDbRoutingViaAPI({
  router_database_id,
  user_attribute,
}: {
  router_database_id: number;
  user_attribute: string | null;
}) {
  cy.request(
    "PUT",
    `/api/ee/database-routing/router-database/${router_database_id}`,
    { user_attribute },
  );
}

export function createDestinationDatabasesViaAPI({
  router_database_id,
  databases,
}: {
  router_database_id: number;
  databases: DatabaseData[];
}) {
  cy.request("POST", "/api/ee/database-routing/mirror-database", {
    router_database_id,
    mirrors: databases,
  });
}

export const BASE_POSTGRES_MIRROR_DB_INFO = {
  is_on_demand: false,
  is_full_sync: true,
  is_sample: false,
  cache_ttl: null,
  refingerprint: false,
  auto_run_queries: true,
  schedules: {},
  details: {
    host: "localhost",
    port: QA_POSTGRES_PORT,
    dbname: "sample",
    user: "metabase",
    "use-auth-provider": false,
    password: "metasample123",
    "schema-filters-type": "all",
    ssl: false,
    "tunnel-enabled": false,
    "advanced-options": false,
  },
  name: "Destination DB",
  engine: "postgres",
};
