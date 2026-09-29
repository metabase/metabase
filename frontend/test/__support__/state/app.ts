import type { AppState } from "metabase/redux/store";

export const createMockAppState = (opts?: Partial<AppState>): AppState => ({
  pageCollection: null,
  pageFrame: null,
  navSection: null,
  navSectionSeed: null,
  openNavItems: [],
  errorPage: null,
  isDndAvailable: false,
  isErrorDiagnosticsOpen: false,
  tempStorage: {
    "last-opened-onboarding-checklist-item": undefined,
  },
  ...opts,
});
