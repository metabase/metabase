import { useState } from "react";

import { skipToken } from "metabase/api";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../constants";
import { isDatabaseProvisioning, isDatabaseUnprovisioning } from "../utils";

export function useFetchWorkspace(workspaceId: WorkspaceId | undefined) {
  const [isPolling, setIsPolling] = useState(false);

  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  const isPollingNeeded = isPollingNeededForWorkspace(workspace);
  if (isPolling !== isPollingNeeded) {
    setIsPolling(isPollingNeeded);
  }

  return { workspace, isLoading, error };
}

function isPollingNeededForWorkspace(workspace: Workspace | undefined) {
  if (workspace == null) {
    return false;
  }

  return (
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseUnprovisioning)
  );
}
