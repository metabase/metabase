import Metadata from "metabase-lib/metadata/Metadata";

export const getDatabase = (metadata: Metadata, databaseId: number) => {
  const database = metadata.database(databaseId);

  if (!database) {
    throw new Error(`Missing metadata for database with id ${databaseId}`);
  }

  return database;
};
