import type { AuthState } from "metabase/redux/store";

export const createMockAuthState = (opts?: Partial<AuthState>): AuthState => ({
  loginPending: false,
  redirect: true,
  ...opts,
});
