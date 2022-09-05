import Metadata from "metabase-lib/lib/metadata/Metadata";

export const getDatabase = (
  metadata: Metadata,
  databaseId: number | string,
) => {
  const database = metadata.database(databaseId);

  if (!database) {
    throw new Error(`Missing metadata for database with id ${databaseId}`);
  }

  return database;
};
