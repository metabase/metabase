import { useEffect, useMemo, useState } from "react";

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

export function useWorkspaceData({
  workspaceId,
  unsavedTransforms,
}: UseWorkspaceDataParams) {
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

  const setupStatus = useWorkspaceSetupStatus(workspaceId);

  const availableTransforms = useMemo(
    () => externalTransforms ?? [],
    [externalTransforms],
  );

  const isLoading =
    isLoadingWorkspace ||
    isLoadingWorkspaceTransforms ||
    isLoadingExternalTransforms;

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
    isLoading,
    isLoadingWorkspace,
    isArchived,
    isPending: setupStatus.workspace?.status === "pending",
  };
}

const LONG_LOGS_POLLING_INTERVAL = 5000;
const SHORT_LOGS_POLLING_INTERVAL = 1000;
export function useWorkspaceSetupStatus(workspaceId: WorkspaceId) {
  const [shouldPoll, setShouldPoll] = useState(true);
  const [pollingInterval, setPollingInterval] = useState(
    LONG_LOGS_POLLING_INTERVAL,
  );
  const {
    data: workspace,
    error,
    isLoading,
  } = useGetWorkspaceLogQuery(workspaceId, {
    pollingInterval,
    refetchOnMountOrArgChange: true,
    skip: !shouldPoll,
  });

  useEffect(() => {
    if (workspace?.status === "pending") {
      setPollingInterval(SHORT_LOGS_POLLING_INTERVAL);
    }
    if (workspace?.status === "ready" || workspace?.status === "archived") {
      setShouldPoll(false);
    }
  }, [workspace?.status]);

  const logs = useMemo(() => workspace?.logs ?? [], [workspace]);

  return { workspace, error, isLoading, logs };
}
