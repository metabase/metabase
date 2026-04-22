import { t } from "ttag";

import type { WorkspaceInfo } from "./types";

export function getInitialWorkspace(): WorkspaceInfo {
  return {
    name: t`New workspace`,
    databases: [],
  };
}

export function isValidWorkspace(workspace: WorkspaceInfo): boolean {
  return workspace.name.trim().length > 0 && workspace.databases.length > 0;
}
