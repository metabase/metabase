import type {
  AdminSessionEndReason,
  AdminSessionProvider,
  AdminSessionSortColumn,
  AdminSessionStatusFilter,
  SortDirection,
} from "metabase-types/api";

import type { SessionsTab, SessionsTimePreset } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: SessionsTab = "active";

export const TAB_VALUES: SessionsTab[] = ["active", "ended"];

export const TAB_STATUS: Record<SessionsTab, AdminSessionStatusFilter> = {
  active: "live",
  ended: "ended",
};

export const TIME_PRESET_VALUES: SessionsTimePreset[] = [
  "hour",
  "day",
  "week",
  "month",
];

// Every path that ends a session. The endpoint takes one at a time, not a list.
export const END_REASON_VALUES: AdminSessionEndReason[] = [
  "admin",
  "logout",
  "password-change",
  "user-deactivated",
  "tenant-deactivated",
  "sso-logout",
  "support-grant-revoked",
  "expired",
  "timed-out",
];

// The auth methods the endpoint accepts as a filter. `unknown` is the bucket for sessions with no auth identity row,
// not a provider anyone logs in with; `mcp` is absent because those sessions are never listed.
export const PROVIDER_VALUES: AdminSessionProvider[] = [
  "password",
  "ldap",
  "google",
  "slack-connect",
  "custom-oidc",
  "jwt",
  "saml",
  "support-access-grant",
  "unknown",
];

export const DEFAULT_SORT_COLUMN: AdminSessionSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminSessionSortColumn[] = [
  "created_at",
  "user_email",
  "provider",
];
