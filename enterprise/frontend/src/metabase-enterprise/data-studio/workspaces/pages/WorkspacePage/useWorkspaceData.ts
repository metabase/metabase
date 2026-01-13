import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import {
  DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
  useGetExternalTransformsQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceTablesQuery,
  useGetWorkspaceTransformsQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { Transform, WorkspaceTransformItem } from "metabase-types/api";

type UseWorkspaceDataParams = {
  workspaceId: number;
  unsavedTransforms: Transform[];
};

export function useWorkspaceData({
  workspaceId,
  unsavedTransforms,
}: UseWorkspaceDataParams) {
  const { data: databases = { data: [] } } = useListDatabasesQuery({});
  const { data: allDbTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(workspaceId);
  const {
    data: workspaceTransforms = [],
    isLoading: isLoadingWorkspaceTransforms,
  } = useGetWorkspaceTransformsQuery(workspaceId);
  const { data: externalTransforms, isLoading: isLoadingExternalTransforms } =
    useGetExternalTransformsQuery(
      { workspaceId, databaseId: workspace?.database_id ?? null },
      { skip: !workspaceId || !workspace?.database_id },
    );

  const {
    data: workspaceTables = DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
    refetch: refetchWorkspaceTables,
  } = useGetWorkspaceTablesQuery(workspaceId);

  const availableTransforms = useMemo(
    () => externalTransforms ?? [],
    [externalTransforms],
  );

  const isLoading =
    isLoadingWorkspace ||
    isLoadingExternalTransforms ||
    isLoadingWorkspaceTransforms;

  const sourceDb = databases?.data.find(
    (db) => db.id === workspace?.database_id,
  );

  const dbTransforms = useMemo(
    () =>
      allDbTransforms.filter((t) => {
        if (t.source_type === "python") {
          return (
            "source-database" in t.source &&
            t.source["source-database"] === sourceDb?.id
          );
        }
        if (t.source_type === "native") {
          return (
            "query" in t.source && t.source.query.database === sourceDb?.id
          );
        }
        return false;
      }),
    [allDbTransforms, sourceDb],
  );

  const allTransforms: (Transform | WorkspaceTransformItem)[] = useMemo(
    () => [...unsavedTransforms, ...workspaceTransforms],
    [unsavedTransforms, workspaceTransforms],
  );

  const isArchived = workspace?.status === "archived";

  return {
    workspace,
    workspaceTransforms,
    workspaceTables,
    refetchWorkspaceTables,
    availableTransforms,
    allTransforms,
    dbTransforms,
    sourceDb,
    isLoading,
    isLoadingWorkspace,
    isArchived,
  };
}
