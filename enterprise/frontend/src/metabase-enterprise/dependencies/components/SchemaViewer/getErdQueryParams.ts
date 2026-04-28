import { skipToken } from "metabase/api";
import type {
  ConcreteTableId,
  DatabaseId,
  GetErdRequest,
} from "metabase-types/api";

interface GetErdQueryParamsArgs {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  extraTableIds: readonly ConcreteTableId[];
}

/**
 * Build the request body for `useGetErdQuery`. Returns `skipToken` when no
 * database is selected (so RTK Query won't fetch).
 *
 * Backend semantics:
 *  - With no schema and no table-ids the backend auto-discovers a focal set.
 *  - With a schema, the backend returns all tables in that schema; we only
 *    append `table-ids` for external tables the user has explicitly expanded
 *    into.
 *  - With no schema but explicit table-ids, those are the focal set.
 */
export function getErdQueryParams({
  databaseId,
  schema,
  extraTableIds,
}: GetErdQueryParamsArgs): GetErdRequest | typeof skipToken {
  if (databaseId == null) {
    return skipToken;
  }
  const params: GetErdRequest = { "database-id": databaseId };
  if (schema != null) {
    params.schema = schema;
  }
  if (extraTableIds.length > 0) {
    params["table-ids"] = [...extraTableIds];
  }
  return params;
}
