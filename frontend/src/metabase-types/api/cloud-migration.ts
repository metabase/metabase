export type CloudMigrationState =
  | "init"
  | "setup"
  | "dump"
  | "upload"
  | "cancelled"
  | "error"
  | "done";

export type CloudMigration = {
  id: number;
  external_id: string;
  state: CloudMigrationState;
  progress: number;
  upload_url: string;
  created_at: string;
  updated_at: string;
};
