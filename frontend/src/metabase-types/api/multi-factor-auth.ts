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

export interface MfaAdminOverview {
  encryption_key_set: boolean;
  enrolled_count: number;
  unenrolled_count: number;
}
