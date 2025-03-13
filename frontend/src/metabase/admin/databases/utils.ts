import type Database from "metabase-lib/v1/metadata/Database";
import type { Database as ApiDatabase } from "metabase-types/api";

export const isDbModifiable = (
  database: Database | ApiDatabase | undefined,
) => {
  return !(database?.id != null && database.is_attached_dwh);
};
