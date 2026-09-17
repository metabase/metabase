import type { AppState } from "metabase/redux/store";

export const createMockAppState = (opts?: Partial<AppState>): AppState => ({
  detailView: null,
  navSection: null,
  errorPage: null,
  isDndAvailable: false,
  isErrorDiagnosticsOpen: false,
  tempStorage: {
    "last-opened-onboarding-checklist-item": undefined,
  },
  ...opts,
});
