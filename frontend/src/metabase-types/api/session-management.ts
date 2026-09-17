import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

export type AdminSessionId = string;

export type AdminSessionType = "normal" | "full-app-embed";

export type AdminSessionProvider =
  | "password"
  | "ldap"
  | "google"
  | "slack-connect"
  | "custom-oidc"
  | "jwt"
  | "saml"
  | "support-access-grant"
  | "unknown";

export type AdminSessionTenancy = "all" | "internal" | "external";

export type AdminSessionStatus = "live" | "ended";

// A session is only ever live or ended; `all` is accepted by the filter alone
export type AdminSessionStatusFilter = AdminSessionStatus | "all";

// One value per path that ends a session
export type AdminSessionEndReason =
  | "admin"
  | "logout"
  | "password-change"
  | "user-deactivated"
  | "tenant-deactivated"
  | "sso-logout"
  | "support-grant-revoked"
  | "expired"
  | "timed-out";

export type AdminSessionSortColumn =
  | "created_at"
  | "last_active_at"
  | "user_email"
  | "provider"
  | "ended_at";

export type AdminSessionUser = {
  id: UserId;
  email: string;
  common_name: string | null;
};

export type AdminSession = {
  id: AdminSessionId;
  user: AdminSessionUser;
  type: AdminSessionType;
  // The response schema is any string; only the filter is limited to AdminSessionProvider
  provider: string;
  created_at: string;
  last_active_at: string | null;
  expires_at: string;
  user_agent: string | null;
  device_description: string | null;
  ip_address: string | null;
  device_id: string | null;
  current: boolean;
  status: AdminSessionStatus;
  ended_at: string | null;
  end_reason: AdminSessionEndReason | null;
  ended_by: UserId | null;
};

export type AdminSessionFilters = {
  "user-id"?: UserId;
  ids?: AdminSessionId[];
  // A list: the endpoint coerces a single `?provider=` into one, so filtering on several auth methods is one request
  provider?: AdminSessionProvider[];
  type?: AdminSessionType;
  tenancy?: AdminSessionTenancy;
  "created-before"?: string;
  "created-after"?: string;
  "last-active-before"?: string;
  "last-active-after"?: string;
};

export type AdminSessionListParams = AdminSessionFilters &
  PaginationRequest & {
    query?: string;
    status?: AdminSessionStatusFilter;
    reason?: AdminSessionEndReason;
    "ended-before"?: string;
    "ended-after"?: string;
    "sort-column"?: AdminSessionSortColumn;
    "sort-direction"?: SortDirection;
  };

export type AdminSessionListResponse = PaginationResponse & {
  data: AdminSession[];
};

export type RevokeAdminSessionsRequest = AdminSessionFilters & {
  "exclude-current"?: boolean;
};

export type RevokeAdminSessionsResponse = {
  revoked: number;
  remaining: number;
  user_ids: UserId[];
};
