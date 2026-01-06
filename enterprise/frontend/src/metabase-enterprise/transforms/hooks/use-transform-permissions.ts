import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api/database";
import type { Transform } from "metabase-types/api";

import { sourceDatabaseId } from "../utils";

export const useTransformPermissions = ({
  transform,
}: {
  transform: Transform | undefined;
}) => {
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery({ include_analytics: true });

  const transformsDatabases = useMemo(() => {
    return databases?.data.filter((d) => d.transforms_permissions === "write");
  }, [databases]);

  const readOnly = useMemo(() => {
    if (!transformsDatabases || !transform) {
      return;
    }
    const dbId = sourceDatabaseId(transform.source);
    return !transformsDatabases.some((db) => db.id === dbId);
  }, [transformsDatabases, transform]);

  return {
    readOnly,
    transformsDatabases,
    isLoadingDatabases,
    databasesError,
  };
};
