import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { User } from "./user";

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

export type MfaAdminUser = Pick<
  User,
  | "id"
  | "email"
  | "first_name"
  | "last_name"
  | "common_name"
  | "is_active"
  | "is_superuser"
  | "sso_source"
>;

export type MfaEnrolledUser = MfaAdminUser & {
  enrolled_at: string | null;
};

export type MfaUserListRequest = { query?: string } & PaginationRequest;

export type MfaUserListResponse<T extends MfaAdminUser> = {
  data: T[];
} & PaginationResponse;
