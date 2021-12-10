export interface User {
  id: string;
  first_name: string;
  is_superuser: boolean;
  personal_collection_id: string;
}

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: string;
}

export interface Collection {
  id: string;
}

export interface Dashboard {
  id: number;
  name: string;
}

export interface DatabaseCandidate {
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}
