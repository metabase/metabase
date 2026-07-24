import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import {
  getUser,
  getUserIsAdmin,
  getUserIsAnalyst,
} from "metabase/selectors/user";

export function canAccessMonitorDiagnostics(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
}

export function canAccessMonitoringTools(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    (getUser(state)?.permissions?.can_access_monitoring ?? false)
  );
}

export function canAccessAlertsManagement(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state);
}

export function canAccessMonitor(state: State) {
  return canAccessMonitorDiagnostics(state) || canAccessMonitoringTools(state);
}
