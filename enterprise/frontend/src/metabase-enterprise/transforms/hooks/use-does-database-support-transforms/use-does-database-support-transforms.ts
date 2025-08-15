import { useCallback } from "react";

import { hasFeature } from "metabase/admin/databases/utils";
import { useListDatabasesQuery } from "metabase/api";
import type { DatabaseId } from "metabase-types/api";

export function useDoesDatabaseSupportTransforms(): (
  databaseId?: DatabaseId,
) => boolean {
  const { data: databases, isLoading } = useListDatabasesQuery();

  return useCallback(
    (databaseId?: DatabaseId) => {
      if (isLoading) {
        return false;
      }
      const database = databases?.data?.find((db) => db.id === databaseId);
      if (!database) {
        return true;
      }

      return !database.is_sample && hasFeature(database, "transforms/table");
    },
    [databases, isLoading],
  );
}
