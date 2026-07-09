export interface PasswordResetTokenStatus {
  valid: boolean;
}

export type MfaMethod = "totp" | "email";
