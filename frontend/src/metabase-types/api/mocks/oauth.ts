import type {
  ListOAuthAuthorizationsResponse,
  OAuthAuthorization,
} from "metabase-types/api";

export const createMockOAuthAuthorization = (
  opts?: Partial<OAuthAuthorization>,
): OAuthAuthorization => ({
  id: 1,
  oauth_client_id: 10,
  client_id: "8f1b2c3d-0000-4a5b-8c9d-000000000001",
  user_id: 3,
  event_type: "approved",
  created_at: "2026-05-01T10:00:00Z",
  client_name: "Claude Code",
  client_uri: "https://claude.ai",
  registration_type: "dynamic",
  application_type: "native",
  redirect_uris: ["https://claude.ai/oauth/callback"],
  user_email: "user@example.com",
  user_first_name: "Test",
  user_last_name: "User",
  ...opts,
});

export const createMockListOAuthAuthorizationsResponse = (
  opts?: Partial<ListOAuthAuthorizationsResponse>,
): ListOAuthAuthorizationsResponse => ({
  data: [createMockOAuthAuthorization()],
  total: 1,
  limit: 50,
  offset: 0,
  ...opts,
});
