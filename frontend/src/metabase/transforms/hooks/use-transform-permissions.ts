import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api/database";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Transform } from "metabase-types/api";

import { isMissingSourceDatabase } from "../utils";

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

  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const permissionsReadOnly = transform
    ? transform.can_execute === false || isMissingSourceDatabase(transform)
    : undefined;

  return {
    readOnly: remoteSyncReadOnly || permissionsReadOnly,
    permissionsReadOnly,
    remoteSyncReadOnly,
    transformsDatabases,
    isLoadingDatabases,
    databasesError,
  };
};
