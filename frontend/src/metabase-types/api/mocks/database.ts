import { Database } from "metabase-types/api";

export const createMockDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Database",
  engine: "H2",
  is_sample: false,
  creator_id: undefined,
  created_at: "2015-01-01T20:10:30.200",
  timezone: "UTC",
  initial_sync_status: "complete",
  ...opts,
});
