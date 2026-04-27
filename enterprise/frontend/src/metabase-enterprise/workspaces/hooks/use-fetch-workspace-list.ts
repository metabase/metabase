import { useState } from "react";

import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { POLLING_INTERVAL } from "../constants";
import { isDatabaseProvisioning, isDatabaseUnprovisioning } from "../utils";

export function useFetchWorkspaceList() {
  const [isPolling, setIsPolling] = useState(false);

  const {
    data: workspaces = [],
    isLoading,
    error,
  } = useListWorkspacesQuery(undefined, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  const isPollingNeeded = workspaces.some(isPollingNeededForWorkspace);
  if (isPolling !== isPollingNeeded) {
    setIsPolling(isPollingNeeded);
  }

  return { workspaces, isLoading, error };
}

function isPollingNeededForWorkspace(workspace: Workspace) {
  return (
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseUnprovisioning)
  );
}
