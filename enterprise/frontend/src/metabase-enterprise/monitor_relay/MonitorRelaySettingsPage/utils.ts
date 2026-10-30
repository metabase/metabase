import { t } from "ttag";

import type { MonitorRelayPhase, MonitorRelayStream } from "metabase-types/api";

export const STATUS_POLLING_INTERVAL_MS = 10_000;

// eslint-disable-next-line metabase/no-literal-metabase-strings -- The name of another product, which whitelabeling does not change.
export const MONITOR_NAME = "Metabase Monitor";

export const URL_ENV_VAR = "MB_METABASE_MONITOR_URL";

export function getPhaseLabel(phase: MonitorRelayPhase): string {
  switch (phase) {
    case "waiting":
      return t`Waiting`;
    case "loading":
      return t`Loading history`;
    case "sealing":
      return t`Processing history`;
    case "live":
      return t`Live`;
  }
}

export function getPhaseDescription(phase: MonitorRelayPhase): string {
  switch (phase) {
    case "waiting":
      return t`${MONITOR_NAME} is choosing where the history starts.`;
    case "loading":
      return t`This instance sends its history, and a full read of its state.`;
    case "sealing":
      return t`${MONITOR_NAME} has the history and processes it.`;
    case "live":
      return t`${MONITOR_NAME} has the history, and gets new rows as they happen.`;
  }
}

export function getStreamLabel(stream: string): string {
  switch (stream) {
    case "change":
      return t`Change log`;
    case "login":
      return t`Logins`;
    case "execution":
      return t`Query executions`;
    case "view":
      return t`Views`;
    case "audit":
      return t`Audit log`;
    default:
      return stream;
  }
}

export function getStateKindLabel(kind: string): string {
  switch (kind) {
    case "card":
      return t`Cards`;
    case "dashboard":
      return t`Dashboards`;
    case "database":
      return t`Databases`;
    case "field":
      return t`Fields`;
    case "field_user_settings":
      return t`Field settings set by users`;
    case "group":
      return t`Groups`;
    case "group_membership":
      return t`Group memberships`;
    case "notification":
      return t`Alerts`;
    case "notification_handler":
      return t`Alert channels`;
    case "notification_recipient":
      return t`Alert recipients`;
    case "notification_subscription":
      return t`Alert schedules`;
    case "pulse":
      return t`Dashboard subscriptions`;
    case "pulse_card":
      return t`Dashboard subscription cards`;
    case "pulse_channel":
      return t`Dashboard subscription channels`;
    case "pulse_channel_recipient":
      return t`Dashboard subscription recipients`;
    case "snippet":
      return t`Snippets`;
    case "table":
      return t`Tables`;
    case "tenant":
      return t`Tenants`;
    case "user":
      return t`Users`;
    default:
      return kind;
  }
}

/**
 * The share of a stream's history that Metabase Monitor has, from 0 to 1, or
 * null before Metabase Monitor sets the history's first and last ids.
 */
export function getHistoryProgress({
  w,
  floor,
  target,
}: Pick<MonitorRelayStream, "w" | "floor" | "target">): number | null {
  if (floor === null || target === null) {
    return null;
  }
  const total = target - floor + 1;
  if (total <= 0) {
    return 1;
  }
  const received = w === null ? 0 : w - floor + 1;
  return Math.min(Math.max(received / total, 0), 1);
}
