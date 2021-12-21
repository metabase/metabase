type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface User {
  id: number;
  first_name: string;
  is_superuser: boolean;
  has_invited_second_user: boolean;
  personal_collection_id: string;
}

export interface Database {
  id: number;
  name: string;
  engine: string;
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
  model?: string;
}

export interface DatabaseCandidate {
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}
