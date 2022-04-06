import { Database } from "metabase-types/api";

export const createMockDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Database",
  engine: "H2",
  is_sample: false,
  is_full_sync: false,
  is_on_demand: false,
  auto_run_queries: false,
  features: [],
  creator_id: 1,
  native_permissions: "read",
  cache_ttl: null,
  caveats: null,
  description: null,
  created_at: "2015-01-01T20:10:30.200",
  updated_at: "2015-01-01T20:10:30.200",
  timezone: "UTC",
  initial_sync_status: "complete",
  ...opts,
});
