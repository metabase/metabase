import { useEffect } from "react";

import {
  skipToken,
  useGetDatabasePermissionsGraphQuery,
  useGetGroupPermissionsGraphQuery,
} from "metabase/api";
import type { DatabaseId, GroupId, PermissionsGraph } from "metabase-types/api";

import { useDataPermissions } from "../../contexts/DataPermissionsContext";

const useLoadedGraph = (graph: PermissionsGraph | undefined) => {
  const { addLoadedGraph } = useDataPermissions();

  useEffect(() => {
    if (graph != null) {
      addLoadedGraph(graph);
    }
  }, [graph, addLoadedGraph]);
};

export function useGroupDataPermissionsGraph(groupId: GroupId | undefined) {
  const { data, isLoading, isFetching } = useGetGroupPermissionsGraphQuery(
    groupId ?? skipToken,
    { refetchOnMountOrArgChange: true },
  );
  useLoadedGraph(data);
  return { isLoading, isFetching };
}

export function useDatabaseDataPermissionsGraph(
  databaseId: DatabaseId | undefined,
) {
  const { data, isLoading, isFetching } = useGetDatabasePermissionsGraphQuery(
    databaseId ?? skipToken,
    { refetchOnMountOrArgChange: true },
  );
  useLoadedGraph(data);
  return { isLoading, isFetching };
}
