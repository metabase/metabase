import type Database from "metabase-lib/v1/metadata/Database";

export const isDbModifiable = (database: Database | undefined) => {
  return !(database?.id != null && database.is_attached_dwh);
};
