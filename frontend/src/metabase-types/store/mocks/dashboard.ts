import type { DashboardState } from "metabase-types/store";

export const createMockDashboardState = (
  opts: Partial<DashboardState> = {},
): DashboardState => ({
  dashboardId: null,
  dashboards: {},
  dashcards: {},
  dashcardData: {},
  parameterValues: {},
  loadingDashCards: {
    dashcardIds: [],
    loadingIds: [],
    loadingStatus: "idle",
    startTime: null,
    endTime: null,
  },
  loadingControls: {},
  isEditing: null,
  isAddParameterPopoverOpen: false,
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
  ...opts,
});
