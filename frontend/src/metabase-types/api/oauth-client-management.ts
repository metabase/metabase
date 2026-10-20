import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

/** The client's `client_id` UUID, not its numeric row id. */
export type OAuthClientId = string;

export const OAUTH_CLIENT_STATUSES = ["active", "revoked"] as const;
export type OAuthClientStatus = (typeof OAUTH_CLIENT_STATUSES)[number];

export type OAuthClientStatusFilter = OAuthClientStatus | "all";

export type OAuthClientRegistrationType = "dynamic" | "static";

export type OAuthClientRevoker = {
  id: UserId;
  email: string;
  common_name: string | null;
};

export type OAuthClient = {
  client_id: OAuthClientId;
  client_name: string | null;
  client_uri: string | null;
  redirect_uris: string[];
  application_type: string | null;
  registration_type: OAuthClientRegistrationType;
  created_at: string;
  status: OAuthClientStatus;
  revoked_at: string | null;
  revoked_by: OAuthClientRevoker | null;
  last_used_at: string | null;
  live_tokens: number;
  user_count: number;
  /** Issued the caller's bearer token; always false for a cookie-authenticated request. */
  current: boolean;
};

export type OAuthClientUser = {
  id: UserId;
  email: string;
  common_name: string | null;
  live_tokens: number;
  last_approved_at: string | null;
};

export type OAuthClientDetail = OAuthClient & {
  scopes: string[];
  contacts: string[];
  users: OAuthClientUser[];
};

export const OAUTH_CLIENT_SORT_COLUMNS = [
  "created_at",
  "client_name",
  "live_tokens",
  "user_count",
  "revoked_at",
  "last_used_at",
] as const;
export type OAuthClientSortColumn = (typeof OAUTH_CLIENT_SORT_COLUMNS)[number];

/** Shared by the list and the revoke, so a revoke ends exactly what the same list shows. */
export type OAuthClientFilterParams = {
  ids?: OAuthClientId[];
  /** Clients this user holds an unrevoked access or refresh token on. */
  "user-id"?: UserId;
  "registered-before"?: string;
  "registered-after"?: string;
};

export type OAuthClientListParams = PaginationRequest &
  OAuthClientFilterParams & {
    status?: OAuthClientStatusFilter;
    /** Free text over the name, the `client_id` and the redirect URIs; every term must match one of them. */
    query?: string;
    "revoked-before"?: string;
    "revoked-after"?: string;
    /** A never-used client matches neither bound. List-only: a client in use can cross them mid-revoke. */
    "last-used-before"?: string;
    "last-used-after"?: string;
    "sort-column"?: OAuthClientSortColumn;
    "sort-direction"?: SortDirection;
  };

export type OAuthClientListResponse = PaginationResponse & {
  data: OAuthClient[];
};

/** An empty request revokes every active client. */
export type RevokeOAuthClientsRequest = OAuthClientFilterParams & {
  /** Spare the client that issued the caller's bearer token. Defaults to true; a no-op without one. */
  "exclude-current"?: boolean;
};

export type RevokeOAuthClientsResponse = {
  revoked: number;
  /** Includes expired tokens, so it can exceed `live_tokens`. */
  tokens_revoked: number;
  user_ids: UserId[];
  /** Active clients still matching the criteria; non-zero only when a registration raced the revoke. */
  remaining: number;
};
