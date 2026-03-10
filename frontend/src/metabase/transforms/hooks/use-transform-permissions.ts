import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api/database";
import type { Database, Transform } from "metabase-types/api";

import { sourceDatabaseId } from "../utils";

export const canEditTransform = (
  transform: Transform,
  transformsDatabases: Database[],
): boolean => {
  const dbId = sourceDatabaseId(transform.source);
  return transformsDatabases.some((db) => db.id === dbId);
};

export const useTransformPermissions = ({
  transform,
}: {
  transform?: Transform;
} = {}) => {
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
    return !canEditTransform(transform, transformsDatabases);
  }, [transformsDatabases, transform]);

  return {
    readOnly,
    transformsDatabases,
    isLoadingDatabases,
    databasesError,
  };
};
