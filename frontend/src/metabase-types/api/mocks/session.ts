import type { PasswordResetTokenStatus } from "metabase-types/api";

export const createMockPasswordResetTokenStatus = (
  opts?: Partial<PasswordResetTokenStatus>,
): PasswordResetTokenStatus => ({
  valid: false,
  ...opts,
});
