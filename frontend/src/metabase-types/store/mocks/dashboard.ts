import type { DashboardState } from "metabase-types/store";

export const createMockDashboardState = (
  opts: Partial<DashboardState> = {},
): DashboardState => ({
  dashboardId: null,
  dashboards: {},
  dashcards: {},
  dashcardData: {},
  parameterValues: {},
  draftParameterValues: {},
  loadingDashCards: {
    loadingIds: [],
    loadingStatus: "idle",
    startTime: null,
    endTime: null,
  },
  loadingControls: {},
  editingDashboard: null,
  isAddParameterPopoverOpen: false,
  isNavigatingBackToDashboard: false,
  slowCards: {},
  sidebar: {
    props: {},
  },
  selectedTabId: null,
  missingActionParameters: null,
  autoApplyFilters: {
    toastId: null,
    toastDashboardId: null,
  },
  tabDeletions: {},
  ...opts,
});
