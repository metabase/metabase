import type { Workspace } from "metabase-types/api";

export const createMockWorkspace = (opts?: Partial<Workspace>): Workspace => ({
  id: 1,
  branch: "workspace-branch",
  creator_id: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  base_version: null,
  ...opts,
});
