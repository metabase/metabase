const WORKSPACES_ROOT_URL = `/data-studio/workspaces`;

export function workspaces() {
  return WORKSPACES_ROOT_URL;
}

export function workspaceInstances() {
  return `${WORKSPACES_ROOT_URL}/instances`;
}
