import { DatabaseCandidate, TableCandidate } from "metabase-types/api";

export const createMockDatabaseCandidate = (
  opts?: Partial<DatabaseCandidate>,
): DatabaseCandidate => ({
  id: "1/public",
  schema: "public",
  tables: [],
  ...opts,
});

export const createMockTableCandidate = (
  opts?: Partial<TableCandidate>,
): TableCandidate => ({
  title: "Sample table",
  url: "/auto/1",
  ...opts,
});
