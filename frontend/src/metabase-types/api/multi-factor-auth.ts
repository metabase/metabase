export type MfaMethod = "totp" | "email";

export interface MfaStatus {
  mfa_enabled: boolean;
  enrolled: boolean;
  pending: boolean;
  method: MfaMethod | null;
  recovery_codes_remaining: number;
}

export interface MfaEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export interface MfaUnenrolledUser {
  id: number;
  email: string;
}

export interface MfaAdminOverview {
  encryption_key_set: boolean;
  enrolled_count: number;
  unenrolled_count: number;
  // one page of the users without a confirmed enrollment, ordered by email
  unenrolled_users: MfaUnenrolledUser[];
  limit: number;
  offset: number;
}
