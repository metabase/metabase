import { useState } from "react";

import { skipToken } from "metabase/api";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../constants";
import { isWorkspaceProvisioning, isWorkspaceUnprovisioning } from "../utils";

export function useFetchWorkspace(workspaceId: WorkspaceId | undefined) {
  const [isPolling, setIsPolling] = useState(false);

  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  const shouldPoll =
    workspace != null &&
    (isWorkspaceProvisioning(workspace) ||
      isWorkspaceUnprovisioning(workspace));

  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  return { workspace, isLoading, error };
}
