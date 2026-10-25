import { useEffect } from "react";

import {
  skipToken,
  useGetDatabasePermissionsGraphQuery,
  useGetGroupPermissionsGraphQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type { DatabaseId, GroupId, PermissionsGraph } from "metabase-types/api";

import { useDataPermissions } from "../../contexts/DataPermissionsContext";

type GraphQueryResult = {
  currentData?: PermissionsGraph;
  isFetching: boolean;
  error?: unknown;
};

const useLoadedGraph = ({
  currentData,
  isFetching,
  error,
}: GraphQueryResult) => {
  const { addLoadedGraph } = useDataPermissions();

  useEffect(() => {
    if (currentData != null) {
      addLoadedGraph(currentData);
    }
  }, [currentData, addLoadedGraph]);

  return {
    isLoading: isFetching && currentData == null,
    error: error != null ? getErrorMessage(error) : undefined,
  };
};

export function useLoadGroupDataPermissions(groupId: GroupId | undefined) {
  return useLoadedGraph(
    useGetGroupPermissionsGraphQuery(groupId ?? skipToken, {
      refetchOnMountOrArgChange: true,
    }),
  );
}

export function useLoadDatabaseDataPermissions(
  databaseId: DatabaseId | undefined,
) {
  return useLoadedGraph(
    useGetDatabasePermissionsGraphQuery(databaseId ?? skipToken, {
      refetchOnMountOrArgChange: true,
    }),
  );
}
