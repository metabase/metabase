import type { ReplaceSourceErrorType } from "metabase-types/api";

export type ReplaceSourceErrorItem = {
  id: string;
  type: ReplaceSourceErrorType;
  name: string;
  database_type?: string;
  source_database_type?: string;
  target_database_type?: string;
  source_fk_target_field_name?: string | null;
  source_fk_target_table_name?: string | null;
  target_fk_target_field_name?: string | null;
  target_fk_target_table_name?: string | null;
};
