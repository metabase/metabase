import { createMockDashboard } from "metabase-types/api/mocks";
import type { DashboardState, StoreDashboard } from "metabase-types/store";

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
  theme: "light",
  ...opts,
});

export function createMockStoreDashboard({
  dashcards = [],
  tabs,
  ...opts
}: Partial<StoreDashboard> = {}): StoreDashboard {
  return {
    ...createMockDashboard(opts),
    dashcards,
    tabs,
    ...opts,
  };
}
