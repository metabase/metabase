import type {
  OAuthClient,
  OAuthClientDetail,
  OAuthClientRevoker,
  OAuthClientUser,
  RevokeOAuthClientsResponse,
} from "metabase-types/api";

export const createMockOAuthClientRevoker = (
  opts: Partial<OAuthClientRevoker> = {},
): OAuthClientRevoker => ({
  id: 1,
  email: "admin@metabase.test",
  common_name: "Test Admin",
  ...opts,
});

export const createMockOAuthClient = (
  opts: Partial<OAuthClient> = {},
): OAuthClient => ({
  client_id: "8f1b2c3d-0000-4a5b-8c9d-000000000001",
  client_name: "Claude Code",
  client_uri: "https://claude.ai",
  logo_uri: null,
  redirect_uris: ["https://claude.ai/oauth/callback"],
  application_type: "native",
  registration_type: "dynamic",
  created_at: "2026-09-01T12:00:00Z",
  status: "active",
  revoked_at: null,
  revoked_by: null,
  live_tokens: 2,
  user_count: 1,
  current: false,
  ...opts,
});

export const createMockOAuthClientUser = (
  opts: Partial<OAuthClientUser> = {},
): OAuthClientUser => ({
  id: 3,
  email: "user@example.com",
  common_name: "Test User",
  live_tokens: 1,
  last_approved_at: "2026-09-01T12:00:00Z",
  ...opts,
});

export const createMockOAuthClientDetail = (
  opts: Partial<OAuthClientDetail> = {},
): OAuthClientDetail => ({
  ...createMockOAuthClient(),
  scopes: ["mb:full"],
  contacts: ["ops@claude.ai"],
  users: [createMockOAuthClientUser()],
  ...opts,
});

export const createMockRevokeOAuthClientsResponse = (
  opts: Partial<RevokeOAuthClientsResponse> = {},
): RevokeOAuthClientsResponse => ({
  revoked: 1,
  tokens_revoked: 2,
  user_ids: [1],
  remaining: 0,
  ...opts,
});
