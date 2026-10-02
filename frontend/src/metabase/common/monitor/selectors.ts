import {
  getUser,
  getUserIsAdmin,
  getUserIsEntitledAnalyst,
} from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

function getUserHasMonitoringPermission(state: State) {
  return getUser(state)?.permissions?.can_access_monitoring ?? false;
}

// Like Data Studio, diagnostics come with the Data Analyst role rather than a
// permissions graph, so they pause while the plan lacks the feature.
export function canAccessDependencyDiagnostics(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsEntitledAnalyst(state);
}

export function canAccessContentDiagnostics(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    getUserIsEntitledAnalyst(state) ||
    getUserHasMonitoringPermission(state)
  );
}

export function canAccessMonitoringTools(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state) || getUserHasMonitoringPermission(state);
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
    canAccessDependencyDiagnostics(state) ||
    canAccessContentDiagnostics(state) ||
    canAccessMonitoringTools(state) ||
    canAccessAiAuditing(state)
  );
}
