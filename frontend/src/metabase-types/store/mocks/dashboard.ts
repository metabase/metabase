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
  },
  loadingControls: {},
  isEditing: null,
  isAddParameterPopoverOpen: false,
  isAddTextPopoverOpen: false,
  slowCards: {},
  sidebar: {
    props: {},
  },
  ...opts,
});
