import { Database, DatabaseData } from "metabase-types/api";

export const createMockDatabase = (opts?: Partial<Database>): Database => ({
  ...createMockDatabaseData(opts),
  id: 1,
  engine: "H2",
  is_sample: false,
  is_saved_questions: false,
  created_at: "2015-01-01T20:10:30.200",
  timezone: "UTC",
  native_permissions: "write",
  initial_sync_status: "complete",
  ...opts,
});

export const createMockDatabaseData = (
  opts?: Partial<DatabaseData>,
): DatabaseData => ({
  name: "Database",
  engine: "H2",
  details: {},
  schedules: {},
  auto_run_queries: false,
  refingerprint: false,
  cache_ttl: null,
  is_sample: false,
  is_full_sync: false,
  is_on_demand: false,
  ...opts,
});
