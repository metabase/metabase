import type { WorkspacesStoreState } from "./types";

export const selectCurrentWorkspace = (state: WorkspacesStoreState) =>
  state.plugins?.workspaces?.currentWorkspace;

export const selectWorkspaces = (state: WorkspacesStoreState) =>
  state.plugins?.workspaces?.workspaces || [];

export const selectWorkspacesLoading = (state: WorkspacesStoreState) =>
  state.plugins?.workspaces?.isLoading || false;

export const selectWorkspacesError = (state: WorkspacesStoreState) =>
  state.plugins?.workspaces?.error;