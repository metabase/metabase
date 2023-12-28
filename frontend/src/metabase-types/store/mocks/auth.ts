import type { AuthState } from "metabase-types/store";

export const createMockAuthState = (opts?: Partial<AuthState>): AuthState => ({
  loginPending: false,
  ...opts,
});
