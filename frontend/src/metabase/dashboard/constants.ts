import type {
  DashboardSidebarName,
  DashboardState,
} from "metabase-types/store";

export const SIDEBAR_NAME: Record<DashboardSidebarName, DashboardSidebarName> =
  {
    addQuestion: "addQuestion",
    action: "action",
    clickBehavior: "clickBehavior",
    editParameter: "editParameter",
    sharing: "sharing",
    info: "info",
    lighthouseAI: "lighthouseAI",
  };

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  dashboardId: null,
  selectedTabId: null,
  isEditing: null,
  dashboards: {},
  dashboardSummaries: {},
  dashcards: {},
  dashcardData: {},
  parameterValues: {},
  loadingDashCards: {
    loadingIds: [],
    loadingStatus: "idle" as const,
    startTime: null,
    endTime: null,
  },
  loadingControls: {},
  isAddParameterPopoverOpen: false,
  isNavigatingBackToDashboard: false,
  slowCards: {},
  sidebar: { props: {} },
  missingActionParameters: null,
  autoApplyFilters: {
    toastId: null,
    toastDashboardId: null,
  },
  tabDeletions: {},
};

export const DASHBOARD_SLOW_TIMEOUT = 15 * 1000;

export const DASHBOARD_PDF_EXPORT_ROOT_ID =
  "Dashboard-Parameters-And-Cards-Container";
