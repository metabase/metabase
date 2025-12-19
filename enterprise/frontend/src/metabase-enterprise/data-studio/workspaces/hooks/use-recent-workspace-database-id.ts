import { useMemo } from "react";

import { useGetWorkspaceQuery } from "metabase-enterprise/api/workspace";
import type { Workspace } from "metabase-types/api/workspace";

type DatabaseOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function useRecentWorkspaceDatabaseId(
  workspaces: Workspace[],
  databaseOptions: DatabaseOption[],
): string | null {
  const recentWorkspaceId = useMemo(() => {
    const recentWorkspace = workspaces.find((w) => !w.archived);
    return recentWorkspace?.id ?? null;
  }, [workspaces]);

  const { data: recentWorkspaceData } = useGetWorkspaceQuery(
    recentWorkspaceId as number,
    { skip: recentWorkspaceId === null },
  );

  if (recentWorkspaceData?.database_id) {
    return String(recentWorkspaceData.database_id);
  }

  // fallback to first enabled database if no workspaces exist
  const firstEnabledDb = databaseOptions.find((db) => !db.disabled);
  return firstEnabledDb?.value ?? null;
}
