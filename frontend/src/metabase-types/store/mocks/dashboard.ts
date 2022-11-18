import { createMockDashboard } from "metabase-types/api/mocks";
import type { DashboardState } from "metabase-types/store";

export const createMockDashboardState = ({
  dashboardId = 1,
  dashboards = {
    [dashboardId as number]: createMockDashboard({ id: dashboardId as number }),
  },
  ...opts
}: Partial<DashboardState> = {}): DashboardState => ({
  dashboardId,
  dashboards,
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
