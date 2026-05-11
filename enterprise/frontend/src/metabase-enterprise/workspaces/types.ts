import type { DatabaseId, WorkspaceDatabaseInput } from "metabase-types/api";

export type WorkspaceDatabaseInfo = {
  database_id: DatabaseId | undefined;
  input: WorkspaceDatabaseInput[];
};

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};
