import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

/** A registered client's `client_id` — the UUID it was issued at registration. */
export type OAuthClientId = string;

export const OAUTH_CLIENT_STATUSES = ["active", "revoked"] as const;
export type OAuthClientStatus = (typeof OAUTH_CLIENT_STATUSES)[number];

// A client is only ever active or revoked; `all` is accepted by the filter alone
export type OAuthClientStatusFilter = OAuthClientStatus | "all";

export type OAuthClientRegistrationType = "dynamic" | "static";

/** The admin who revoked a client. Null once that admin is deleted. */
export type OAuthClientRevoker = {
  id: UserId;
  email: string;
  common_name: string | null;
};

export type OAuthClient = {
  client_id: OAuthClientId;
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: string[];
  application_type: string | null;
  registration_type: OAuthClientRegistrationType;
  created_at: string;
  status: OAuthClientStatus;
  revoked_at: string | null;
  revoked_by: OAuthClientRevoker | null;
  /** Unrevoked, unexpired access tokens — whether revoking the client cuts anyone off right now. */
  live_tokens: number;
  /** Distinct users among those tokens — the blast radius of revoking the client. */
  user_count: number;
  /** The client that issued the caller's bearer token. Always false for a cookie-authenticated request. */
  current: boolean;
};

export const OAUTH_CLIENT_SORT_COLUMNS = [
  "created_at",
  "client_name",
  "live_tokens",
  "user_count",
  "revoked_at",
] as const;
export type OAuthClientSortColumn = (typeof OAUTH_CLIENT_SORT_COLUMNS)[number];

/**
 * The criteria the list and the revoke share. Every one of them can match an active client, so a revoke by these
 * ends exactly the clients a list with the same criteria would have shown.
 */
export type OAuthClientFilterParams = {
  ids?: OAuthClientId[];
  /** Clients this user still holds an unrevoked access or refresh token on. */
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
    "sort-column"?: OAuthClientSortColumn;
    "sort-direction"?: SortDirection;
  };

export type OAuthClientListResponse = PaginationResponse & {
  data: OAuthClient[];
};

/**
 * An empty request revokes every active client. `status`, `revoked-*` and `query` are rejected rather than narrowed,
 * so the list always previews exactly what the same criteria would revoke.
 */
export type RevokeOAuthClientsRequest = OAuthClientFilterParams & {
  /** Hold back the client that issued the caller's own bearer token. Defaults to true; a no-op without one. */
  "exclude-current"?: boolean;
};

export type RevokeOAuthClientsResponse = {
  revoked: number;
  /** Access and refresh tokens stamped. Counts expired ones too, so it can exceed the list's `live_tokens`. */
  tokens_revoked: number;
  user_ids: UserId[];
  /** Active clients still matching the criteria; non-zero only when a registration raced the revoke. */
  remaining: number;
};
