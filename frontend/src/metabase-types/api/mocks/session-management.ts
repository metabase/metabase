import type {
  AdminSession,
  AdminSessionUser,
  RevokeAdminSessionsResponse,
} from "metabase-types/api";

export const createMockAdminSessionUser = (
  opts: Partial<AdminSessionUser> = {},
): AdminSessionUser => ({
  id: 1,
  email: "user@metabase.test",
  common_name: "Test User",
  ...opts,
});

export const createMockAdminSession = (
  opts: Partial<AdminSession> = {},
): AdminSession => ({
  id: "3b2f4c1e-9a7d-4e6b-8c5a-1d0f2e3b4a5c",
  user: createMockAdminSessionUser(),
  type: "normal",
  provider: "password",
  created_at: "2026-09-01T12:00:00Z",
  last_active_at: "2026-09-15T09:30:00Z",
  expires_at: "2026-09-15T12:00:00Z",
  user_agent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  device_description: "Browser (Chrome/Macintosh)",
  ip_address: "127.0.0.1",
  device_id: "7a6f5e4d-3c2b-4a19-8e7d-6c5b4a392817",
  current: false,
  status: "live",
  ended_at: null,
  end_reason: null,
  ended_by: null,
  ...opts,
});

export const createMockRevokeAdminSessionsResponse = (
  opts: Partial<RevokeAdminSessionsResponse> = {},
): RevokeAdminSessionsResponse => ({
  revoked: 1,
  remaining: 0,
  user_ids: [1],
  ...opts,
});
