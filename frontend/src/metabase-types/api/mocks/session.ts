import { PasswordResetTokenInfo } from "metabase-types/api";

export const createMockPasswordResetTokenInfo = (
  opts?: Partial<PasswordResetTokenInfo>,
): PasswordResetTokenInfo => ({
  valid: false,
  ...opts,
});
