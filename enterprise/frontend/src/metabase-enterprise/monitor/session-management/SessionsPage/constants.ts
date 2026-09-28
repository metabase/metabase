import type {
  SessionEndReason,
  SessionProvider,
  SessionSortColumn,
  SessionStatusFilter,
  SortDirection,
} from "metabase-types/api";

import type { SessionsTab, SessionsTimePreset } from "./types";

export const PAGE_SIZE = 50;

export const DEFAULT_TAB: SessionsTab = "active";

export const TAB_VALUES: SessionsTab[] = ["active", "ended"];

export const TAB_STATUS: Record<SessionsTab, SessionStatusFilter> = {
  active: "live",
  ended: "ended",
};

export const TIME_PRESET_VALUES: SessionsTimePreset[] = [
  "hour",
  "day",
  "week",
  "month",
];

export const END_REASON_VALUES: SessionEndReason[] = [
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

export const PROVIDER_VALUES: SessionProvider[] = [
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

export const DEFAULT_SORT_COLUMN: SessionSortColumn = "created_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: SessionSortColumn[] = [
  "created_at",
  "user_email",
  "provider",
];
