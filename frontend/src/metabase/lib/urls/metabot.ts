import { DatabaseId } from "metabase-types/api";

export const databaseMetabot = (id: DatabaseId) => {
  return `/metabot/database/${id}`;
};
