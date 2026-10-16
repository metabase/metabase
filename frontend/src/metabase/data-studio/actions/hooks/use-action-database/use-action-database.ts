import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { Database, WritebackAction } from "metabase-types/api";

type ActionDatabaseResult = {
  database: Database | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useActionDatabase(
  action: WritebackAction | undefined,
): ActionDatabaseResult {
  const { data, isLoading, error } = useListDatabasesQuery();
  const database = useMemo(
    () => data?.data.find((database) => database.id === action?.database_id),
    [data, action?.database_id],
  );
  return { database, isLoading, error };
}
