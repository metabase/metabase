export interface DatabaseCandidate {
  id: string;
  schema: string;
  tables: TableCandidate[];
}

export const createDatabaseCandidate = (
  opts?: Partial<DatabaseCandidate>,
): DatabaseCandidate => ({
  id: "1/public",
  schema: "public",
  tables: [],
  ...opts,
});

export interface TableCandidate {
  title: string;
  url: string;
}

export const createTableCandidate = (
  opts?: Partial<TableCandidate>,
): TableCandidate => ({
  title: "Sample table",
  url: "/auto/1",
  ...opts,
});
