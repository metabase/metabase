export type DataAppId = number;

export interface DataApp {
  id: DataAppId;
  name: string;
  display_name: string;
  bundle_hash: string;
  creator_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDataAppRequest {
  name: string;
  display_name: string;
  file: File;
}
