export interface Database {
  id: number;
  is_sample: boolean;
}

export interface DatabaseCandidate {
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}
