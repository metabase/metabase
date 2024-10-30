import type { AppState } from "metabase-types/store";

export const createMockAppState = (opts?: Partial<AppState>): AppState => ({
  isNavbarOpen: true,
  errorPage: null,
  tempStorage: {
    "last-opened-onboarding-checklist-item": undefined,
  },
  ...opts,
});
