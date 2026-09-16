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

export type AdminSessionSortColumn =
  | "created_at"
  | "last_active_at"
  | "user_email"
  | "provider";

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
};

export type AdminSessionFilters = {
  "user-id"?: UserId;
  ids?: AdminSessionId[];
  provider?: AdminSessionProvider;
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
