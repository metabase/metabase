import fetchMock from "fetch-mock";

import type { WorkspaceId, WorkspaceProblem } from "metabase-types/api";

export function setupWorkspaceProblemsEndpoint(
  workspaceId: WorkspaceId,
  problems: WorkspaceProblem[] = [],
) {
  fetchMock.get(`path:/api/ee/workspace/${workspaceId}/problem`, problems);
}
