import {
  getUser,
  getUserIsAdmin,
  getUserIsEntitledAnalyst,
} from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

// Like Data Studio, diagnostics come with the Data Analyst role rather than a
// permissions graph, so they pause while the plan lacks the feature.
export function canAccessMonitorDiagnostics(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsEntitledAnalyst(state);
}

export function canAccessMonitoringTools(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    (getUser(state)?.permissions?.can_access_monitoring ?? false)
  );
}

export function canAccessAlertsManagement(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state);
}

export function canAccessAiAuditing(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state);
}

export function canAccessMonitor(state: State) {
  return (
    canAccessMonitorDiagnostics(state) ||
    canAccessMonitoringTools(state) ||
    canAccessAiAuditing(state)
  );
}
