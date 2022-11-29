import { createMockDashboard } from "metabase-types/api/mocks";
import type { DashboardState } from "metabase-types/store";

export const createMockDashboardState = (
  opts: Partial<DashboardState> = {},
): DashboardState => ({
  dashboardId: null,
  dashboards: {},
  dashcards: {},
  dashcardData: {},
  parameterValues: {},
  parameterValuesSearchCache: {},
  loadingDashCards: {
    dashcardIds: [],
    loadingIds: [],
    loadingStatus: "idle",
    startTime: null,
  },
  loadingControls: {},
  isEditing: null,
  isAddParameterPopoverOpen: false,
  slowCards: {},
  sidebar: {
    props: {},
  },
  titleTemplateChange: null,
  ...opts,
});
