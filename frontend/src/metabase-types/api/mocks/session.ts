import type { PasswordResetTokenStatus } from "metabase-types/api";

export const createMockPasswordResetTokenStatus = (
  opts?: Partial<PasswordResetTokenStatus>,
): PasswordResetTokenStatus => ({
  valid: false,
  password_reset_required: false,
  ...opts,
});
