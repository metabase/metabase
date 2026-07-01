import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import {
  getUser,
  getUserIsAdmin,
  getUserIsAnalyst,
} from "metabase/selectors/user";

export function canAccessMonitor(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
}

// Gating for the Admin Tools pages migrated into the Monitor space.
export function canAccessMonitoringTools(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    (getUser(state)?.permissions?.can_access_monitoring ?? false)
  );
}
