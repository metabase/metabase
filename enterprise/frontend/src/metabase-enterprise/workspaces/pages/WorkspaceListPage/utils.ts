import type { Workspace } from "metabase-types/api";

export function filterWorkspaces(
  workspaces: Workspace[],
  query: string,
): Workspace[] {
  if (query.length === 0) {
    return workspaces;
  }
  const lowercaseQuery = query.toLowerCase();
  return workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(lowercaseQuery),
  );
}
