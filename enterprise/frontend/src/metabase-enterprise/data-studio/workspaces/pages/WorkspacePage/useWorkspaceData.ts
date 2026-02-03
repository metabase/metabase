import { useMemo } from "react";

import { skipToken } from "metabase/api";
import {
  useGetExternalTransformsQuery,
  useGetWorkspaceLogQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceTransformsQuery,
} from "metabase-enterprise/api";
import type {
  UnsavedTransform,
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

type UseWorkspaceDataParams = {
  workspaceId: number;
  unsavedTransforms: UnsavedTransform[];
};

export type SetupStatus = ReturnType<typeof useWorkspaceSetupStatus>;

const LOGS_POLLING_INTERVAL_LONG = 5000;
const LOGS_POLLING_INTERVAL_SHORT = 1000;

export function useWorkspaceData({
  workspaceId,
  unsavedTransforms,
}: UseWorkspaceDataParams) {
  const {
    data: workspace,
    error: workspaceError,
    isLoading: isLoadingWorkspace,
  } = useGetWorkspaceQuery(workspaceId);
  const {
    data: workspaceTransforms = [],
    error: workspaceTransformsError,
    isLoading: isLoadingWorkspaceTransforms,
  } = useGetWorkspaceTransformsQuery(workspaceId);
  const { data: externalTransforms, isLoading: isLoadingExternalTransforms } =
    useGetExternalTransformsQuery(
      workspace?.database_id
        ? { workspaceId, databaseId: workspace?.database_id }
        : skipToken,
    );

  const setupStatus = useWorkspaceSetupStatus({
    pollingInterval:
      workspace?.status === "pending"
        ? LOGS_POLLING_INTERVAL_SHORT
        : LOGS_POLLING_INTERVAL_LONG,
    workspaceId,
  });

  const availableTransforms = useMemo(
    () => externalTransforms ?? [],
    [externalTransforms],
  );

  const isLoading =
    isLoadingWorkspace ||
    isLoadingWorkspaceTransforms ||
    isLoadingExternalTransforms;
  const error = workspaceError || workspaceTransformsError;

  const allTransforms: (UnsavedTransform | WorkspaceTransformListItem)[] =
    useMemo(
      () => [...unsavedTransforms, ...workspaceTransforms],
      [unsavedTransforms, workspaceTransforms],
    );

  const isArchived = workspace?.status === "archived";

  return {
    workspace,
    workspaceTransforms,
    availableTransforms,
    allTransforms,
    setupStatus,
    error,
    isLoading,
    isLoadingWorkspace,
    isLoadingWorkspaceTransforms,
    isArchived,
    isPending: setupStatus.workspace?.status === "pending",
  };
}

export function useWorkspaceSetupStatus({
  pollingInterval,
  workspaceId,
}: {
  pollingInterval: number;
  workspaceId: WorkspaceId;
}) {
  const {
    data: workspace,
    error,
    isLoading,
  } = useGetWorkspaceLogQuery(workspaceId, {
    pollingInterval,
    refetchOnMountOrArgChange: true,
  });

  const logs = useMemo(() => workspace?.logs ?? [], [workspace]);

  return { workspace, error, isLoading, logs };
}
