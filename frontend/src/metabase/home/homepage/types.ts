type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface User {
  id: number;
  first_name: string;
  is_superuser: boolean;
  personal_collection_id: string;
}

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: number;
  initial_sync_status: InitialSyncStatus;
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
