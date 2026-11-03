import { useEffect, useMemo } from "react";
import { shallowEqual } from "react-redux";
import _ from "underscore";

import { databaseApi, skipToken, useGetDatabaseQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import type { DatabaseId, Field, Table } from "metabase-types/api";

// The same request as the Data Studio database and schema drawers, so they
// share one cache entry per database
const getDatabaseRequest = (id: DatabaseId) => ({
  id,
  include: "tables.fields" as const,
});

/**
 * A table's fields. Table lists often come without them, so they're read from
 * the table's database; `undefined` while that loads.
 */
export function useTableFields(
  table: Pick<Table, "db_id" | "id" | "fields">,
): Field[] | undefined {
  const hasFields = table.fields != null && table.fields.length > 0;
  const { currentData: database } = useGetDatabaseQuery(
    hasFields ? skipToken : getDatabaseRequest(table.db_id),
  );
  return hasFields
    ? table.fields
    : database?.tables?.find(({ id }) => id === table.id)?.fields;
}

/**
 * The given tables with their fields, loaded per database while `isEnabled`.
 * Tables keep their own data; only `fields` comes from the database.
 */
export function useTablesWithFields(
  tables: Table[],
  { isEnabled }: { isEnabled: boolean },
): { tables: Table[]; isLoading: boolean } {
  const dispatch = useDispatch();
  const databaseIds = useMemo(
    () => _.uniq(tables.map((table) => table.db_id)),
    [tables],
  );

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const subscriptions = databaseIds.map((id) =>
      dispatch(
        databaseApi.endpoints.getDatabase.initiate(getDatabaseRequest(id)),
      ),
    );
    return () =>
      subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [dispatch, databaseIds, isEnabled]);

  const databases = useSelector(
    (state) =>
      isEnabled
        ? databaseIds.map(
            (id) =>
              databaseApi.endpoints.getDatabase.select(getDatabaseRequest(id))(
                state,
              ).data,
          )
        : [],
    shallowEqual,
  );

  return useMemo(() => {
    if (!isEnabled) {
      return { tables, isLoading: false };
    }
    const fieldsByTableId = new Map(
      databases.flatMap((database) =>
        (database?.tables ?? []).map((table) => [table.id, table.fields]),
      ),
    );
    return {
      tables: tables.map((table) => ({
        ...table,
        fields: fieldsByTableId.get(table.id) ?? table.fields,
      })),
      isLoading: databases.some((database) => database == null),
    };
  }, [databases, isEnabled, tables]);
}
