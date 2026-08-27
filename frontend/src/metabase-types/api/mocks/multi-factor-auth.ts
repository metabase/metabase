import type {
  MfaAdminOverview,
  MfaEnrollResponse,
  MfaEnrolledUser,
  MfaStatus,
} from "metabase-types/api";

export const createMockMfaStatus = (opts?: Partial<MfaStatus>): MfaStatus => ({
  mfa_enabled: true,
  enrolled: false,
  pending: false,
  method: null,
  recovery_codes_remaining: 0,
  ...opts,
});

export const createMockMfaEnrollResponse = (
  opts?: Partial<MfaEnrollResponse>,
): MfaEnrollResponse => ({
  secret: "",
  otpauth_uri: "",
  ...opts,
});

export const createMockMfaAdminOverview = (
  opts?: Partial<MfaAdminOverview>,
): MfaAdminOverview => ({
  encryption_key_set: true,
  enrolled_count: 0,
  unenrolled_count: 0,
  ...opts,
});

export const createMockMfaEnrolledUser = (
  opts?: Partial<MfaEnrolledUser>,
): MfaEnrolledUser => ({
  id: 1,
  email: "user@metabase.test",
  first_name: "Test",
  last_name: "User",
  common_name: "Test User",
  sso_source: null,
  is_active: true,
  is_superuser: false,
  enrolled_at: "2026-07-01T00:00:00Z",
  ...opts,
});
