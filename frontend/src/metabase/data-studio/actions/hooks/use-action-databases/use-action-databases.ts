import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import { hasActionsEnabled } from "metabase/common/utils/database";
import type { Database } from "metabase-types/api";

type ActionDatabasesResult = {
  databases: Database[];
  isLoading: boolean;
  error: unknown;
};

export function useActionDatabases(): ActionDatabasesResult {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = useMemo(
    () => data?.data.filter(hasActionsEnabled) ?? [],
    [data],
  );
  return { databases, isLoading, error };
}
