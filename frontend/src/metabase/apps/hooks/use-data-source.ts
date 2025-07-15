import { useGetAdhocQueryQuery } from "metabase/api";

import type { ComponentDataSource } from "../types";

export function useDataSource(dataSource?: ComponentDataSource) {
  const { data, isLoading, error } = useGetAdhocQueryQuery(
    {
      type: "query",
      database: dataSource?.databaseId ?? 1,
      query: {
        "source-table": dataSource?.tableId ?? 1,
        limit: 50,
      },
    },
    { skip: !dataSource },
  );

  return {
    data,
    isLoading,
    error,
  };
}
