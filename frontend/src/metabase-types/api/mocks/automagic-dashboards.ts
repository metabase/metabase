import { DatabaseCandidate, TableCandidate } from "metabase-types/api";

export const createDatabaseCandidate = (
  opts?: Partial<DatabaseCandidate>,
): DatabaseCandidate => ({
  id: "1/public",
  schema: "public",
  tables: [],
  ...opts,
});

export const createTableCandidate = (
  opts?: Partial<TableCandidate>,
): TableCandidate => ({
  title: "Sample table",
  url: "/auto/1",
  ...opts,
});
