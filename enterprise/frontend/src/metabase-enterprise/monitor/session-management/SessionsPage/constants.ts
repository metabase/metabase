import type {
  AdminSessionProvider,
  AdminSessionSortColumn,
  AdminSessionStatusFilter,
  SortDirection,
} from "metabase-types/api";

import type { SessionsLastActive, SessionsTab } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: SessionsTab = "active";

export const TAB_VALUES: SessionsTab[] = ["active", "ended"];

export const TAB_STATUS: Record<SessionsTab, AdminSessionStatusFilter> = {
  active: "live",
  ended: "ended",
};

export const LAST_ACTIVE_VALUES: SessionsLastActive[] = [
  "hour",
  "day",
  "week",
  "month",
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
