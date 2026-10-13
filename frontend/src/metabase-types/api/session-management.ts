import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

export type SessionId = string;

export type SessionType = "normal" | "full-app-embed";

export const SESSION_PROVIDERS = [
  "password",
  "ldap",
  "google",
  "slack-connect",
  "custom-oidc",
  "jwt",
  "saml",
  "support-access-grant",
  "unknown",
] as const;
export type SessionProvider = (typeof SESSION_PROVIDERS)[number];

export type SessionTenancy = "all" | "internal" | "external";

export type SessionStatus = "live" | "ended";

// A session is only ever live or ended; `all` is accepted by the filter alone
export type SessionStatusFilter = SessionStatus | "all";

// One value per path that ends a session
export const SESSION_END_REASONS = [
  "admin",
  "logout",
  "password-change",
  "user-deactivated",
  "tenant-deactivated",
  "sso-logout",
  "support-grant-revoked",
  "expired",
  "timed-out",
] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export type SessionSortColumn =
  | "created_at"
  | "last_active_at"
  | "user_email"
  | "provider"
  | "ended_at";

export type SessionUser = {
  id: UserId;
  email: string;
  common_name: string | null;
};

export type Session = {
  id: SessionId;
  user: SessionUser;
  type: SessionType;
  // The response schema is any string; only the filter is limited to SessionProvider
  provider: string;
  created_at: string;
  last_active_at: string | null;
  expires_at: string;
  user_agent: string | null;
  device_description: string | null;
  ip_address: string | null;
  device_id: string | null;
  current: boolean;
  status: SessionStatus;
  ended_at: string | null;
  end_reason: SessionEndReason | null;
  ended_by: UserId | null;
};

export type SessionFilters = {
  "user-id"?: UserId;
  ids?: SessionId[];
  // A list: the endpoint coerces a single `?provider=` into one, so filtering on several auth methods is one request
  provider?: SessionProvider[];
  type?: SessionType;
  tenancy?: SessionTenancy;
  "created-before"?: string;
  "created-after"?: string;
  "last-active-before"?: string;
  "last-active-after"?: string;
};

export type SessionListParams = SessionFilters &
  PaginationRequest & {
    query?: string;
    status?: SessionStatusFilter;
    reason?: SessionEndReason;
    "ended-before"?: string;
    "ended-after"?: string;
    "sort-column"?: SessionSortColumn;
    "sort-direction"?: SortDirection;
  };

export type SessionCountsResponse = {
  active: number;
  ended: number;
};

export type SessionListResponse = PaginationResponse & {
  data: Session[];
};

export type RevokeSessionsRequest = SessionFilters & {
  "exclude-current"?: boolean;
};

export type RevokeSessionsResponse = {
  revoked: number;
  remaining: number;
  user_ids: UserId[];
};
