import type {
  MfaAdminOverview,
  MfaEnrollResponse,
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
