import type { State } from "metabase/redux/store";
import {
  getUser,
  getUserIsAdmin,
  getUserIsAnalyst,
} from "metabase/selectors/user";
import { isWithinIframe } from "metabase/utils/iframe";

function getUserHasMonitoringPermission(state: State) {
  return getUser(state)?.permissions?.can_access_monitoring ?? false;
}

export function canAccessMonitorDiagnostics(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    getUserIsAnalyst(state) ||
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
    canAccessMonitorDiagnostics(state) ||
    canAccessMonitoringTools(state) ||
    canAccessAiAuditing(state)
  );
}
