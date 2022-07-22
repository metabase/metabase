import { AppState } from "metabase-types/store";

export const createMockAppState = (opts?: Partial<AppState>): AppState => ({
  isNavbarOpen: true,
  errorPage: null,
  breadcrumbs: {
    collectionId: "root",
    show: false,
  },
  ...opts,
});
