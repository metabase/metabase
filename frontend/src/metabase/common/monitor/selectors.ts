import {
  getUser,
  getUserIsAdmin,
  getUserIsAnalyst,
} from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

export function canAccessMonitorDiagnostics(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
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
