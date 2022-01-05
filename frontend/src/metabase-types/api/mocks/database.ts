import { Database } from "metabase-types/api";

export const createDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Database",
  engine: "H2",
  is_sample: false,
  creator_id: undefined,
  initial_sync_status: "complete",
  ...opts,
});
