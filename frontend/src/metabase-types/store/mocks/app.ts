import type { AppState } from "metabase-types/store";

export const createMockAppState = (opts?: Partial<AppState>): AppState => ({
  isNavbarOpen: true,
  errorPage: null,
  isDndAvailable: false,
  ...opts,
});
