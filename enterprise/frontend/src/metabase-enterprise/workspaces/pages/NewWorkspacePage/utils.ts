import type {
  CreateWorkspaceRequest,
  WorkspaceDatabaseParams,
} from "metabase-types/api";

import type { WorkspaceInfo } from "../../types";

export function createRequest(
  workspace: WorkspaceInfo,
): CreateWorkspaceRequest {
  const databases = workspace.databases.reduce<WorkspaceDatabaseParams[]>(
    (acc, { database_id, input }) => {
      if (database_id != null) {
        acc.push({ database_id, input });
      }
      return acc;
    },
    [],
  );

  return {
    name: workspace.name,
    databases,
  };
}
