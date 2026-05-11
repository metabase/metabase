import type { DatabaseId } from "metabase-types/api";

export type WorkspaceDatabaseInfo = {
  database_id: DatabaseId | undefined;
  input_schemas: string[];
};

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};
