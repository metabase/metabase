import { t } from "ttag";

import type { WorkspaceInfo } from "./types";

export function getWorkspaceErrorMessage(
  workspace: WorkspaceInfo,
): string | undefined {
  if (workspace.name.trim().length === 0) {
    return t`Workspace name is required.`;
  }

  if (workspace.databases.length === 0) {
    return t`At least one database is required.`;
  }

  if (workspace.databases.some((database) => database.database_id == null)) {
    return t`Each database must be selected.`;
  }

  return undefined;
}
