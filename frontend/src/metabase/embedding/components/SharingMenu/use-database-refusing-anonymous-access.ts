import { skipToken, useListDatabasesQuery } from "metabase/api";
import { refusesAnonymousAccess } from "metabase/common/utils/database";
import type { Database, DatabaseId } from "metabase-types/api";

/**
 * The first of `databaseIds` that refuses anonymous traffic, if any — a routed
 * database no admin has allowed anonymous access to.
 *
 * The database list is the response that hydrates the routing fields, so it is
 * read rather than the question's or dashboard's own metadata. The sharing menu
 * only mounts its items once opened, so the list is not fetched for every page
 * view.
 */
export function useDatabaseRefusingAnonymousAccess(
  databaseIds: DatabaseId[],
): Database | undefined {
  const { data } = useListDatabasesQuery(
    databaseIds.length === 0 ? skipToken : undefined,
  );

  return data?.data.find(
    (database) =>
      databaseIds.includes(database.id) && refusesAnonymousAccess(database),
  );
}
