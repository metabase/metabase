import type { DatabaseId } from "metabase-types/api";

export const isDbModifiable = (
  database: { id?: DatabaseId; is_attached_dwh?: boolean } | undefined,
) => {
  return !(database?.id != null && database.is_attached_dwh);
};
