import type { WorkspaceInstance } from "metabase-types/api";

import type { WorkspaceOverviewDatabaseRow } from "./types";

export function toDatabaseEntries(
  databases: WorkspaceInstance["databases"],
): WorkspaceOverviewDatabaseRow[] {
  return Object.entries(databases).map(([id, config]) => ({
    id: Number(id),
    config,
  }));
}
