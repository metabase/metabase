import { useMemo } from "react";

import { useGetWorkspaceQuery } from "metabase-enterprise/api/workspace";
import type {
  Workspace,
  WorkspaceAllowedDatabase,
} from "metabase-types/api/workspace";

export function useRecentWorkspaceDatabaseId(
  workspaces: Workspace[],
  allowedDatabases?: WorkspaceAllowedDatabase[],
): number | undefined {
  const recentWorkspaceId = useMemo(() => {
    const recentWorkspace = workspaces.find((w) => !w.archived);
    return recentWorkspace?.id ?? null;
  }, [workspaces]);

  const { data: recentWorkspaceData } = useGetWorkspaceQuery(
    recentWorkspaceId as number,
    { skip: recentWorkspaceId === null },
  );

  if (recentWorkspaceData?.database_id) {
    return recentWorkspaceData.database_id;
  }

  // fallback to first enabled database if no workspaces exist
  const firstEnabledDb = allowedDatabases?.find((db) => db.supported);
  return firstEnabledDb?.id;
}
