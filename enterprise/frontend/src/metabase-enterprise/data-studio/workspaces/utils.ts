import type { WorkspaceSetupStatus } from "metabase-types/api";

export const isWorkspaceUninitialized = (workspace: {
  status: WorkspaceSetupStatus;
}) => {
  return workspace.status === "uninitialized";
};

export const isWorkspaceReady = (workspace: {
  status: WorkspaceSetupStatus;
}) => {
  return workspace.status === "ready";
};
