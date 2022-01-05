export interface DatabaseCandidate {
  id: string;
  schema: string;
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}
