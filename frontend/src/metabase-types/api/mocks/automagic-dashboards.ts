import type { DatabaseXray, TableXray } from "metabase-types/api";

export const createMockDatabaseCandidate = (
  opts?: Partial<DatabaseXray>,
): DatabaseXray => ({
  id: "1/public",
  schema: "public",
  tables: [],
  ...opts,
});

export const createMockTableCandidate = (
  opts?: Partial<TableXray>,
): TableXray => ({
  title: "Sample table",
  url: "/auto/1",
  ...opts,
});
