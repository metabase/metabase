import { useSelector } from "metabase/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Dashboard } from "metabase-types/api";

/**
 * Whether the user can change the dashboard from Data Studio: they can write
 * it, it is not in the trash, and remote sync is not read-only.
 */
export function useCanEditDashboard(
  dashboard: Pick<Dashboard, "can_write" | "archived">,
): boolean {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  return dashboard.can_write && !dashboard.archived && !isRemoteSyncReadOnly;
}
