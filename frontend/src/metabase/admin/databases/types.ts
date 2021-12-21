export interface Database {
  id: number;
  is_sample: boolean;
}

export interface DatabaseCandidate {
  schema: string;
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}
