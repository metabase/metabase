import { hasFeature } from "metabase/admin/databases/utils";
import type { Database } from "metabase-types/api";

export function isWorkspaceDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}
