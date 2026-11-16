import { useGetDatabaseQuery, useListDatabasesQuery } from "metabase/api";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

export const useDatabaseCrumb = (id: DatabaseId) => {
  // We display what the database list already holds to avoid showing a loading
  // state. It's possible because GET /api/database is always dispatched on app
  // launch. We still re-fetch the database to get new data, just in case it
  // changed.
  const { data: databasesResponse } = useListDatabasesQuery();
  const cachedDatabase = databasesResponse?.data.find(
    (database) => database.id === id,
  );

  const { data: fetchedDatabase } = useGetDatabaseQuery({ id });

  const database = fetchedDatabase ?? cachedDatabase;

  if (!database) {
    return {
      title: null,
      to: Urls.browseDatabase({ id }),
    };
  }

  return {
    title: database.name,
    to: Urls.browseDatabase(database),
  };
};
