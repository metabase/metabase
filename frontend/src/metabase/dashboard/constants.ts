import type {
  DashboardSidebarName,
  DashboardState,
} from "metabase-types/store";

import type { EmbedDisplayParams } from "./types";

export const DASHBOARD_DESCRIPTION_MAX_LENGTH = 1500;

export const SIDEBAR_NAME: Record<DashboardSidebarName, DashboardSidebarName> =
  {
    addQuestion: "addQuestion",
    action: "action",
    clickBehavior: "clickBehavior",
    editParameter: "editParameter",
    sharing: "sharing",
    info: "info",
  };

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  dashboardId: null,
  selectedTabId: null,
  editingDashboard: null,
  dashboards: {},
  dashcards: {},
  dashcardData: {},
  parameterValues: {},
  draftParameterValues: {},
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
  theme: "light",
};

export const DASHBOARD_SLOW_TIMEOUT = 15 * 1000;

export const DASHBOARD_PDF_EXPORT_ROOT_ID =
  "Dashboard-Parameters-And-Cards-Container";

export const DEFAULT_DASHBOARD_DISPLAY_OPTIONS: EmbedDisplayParams = {
  bordered: false,
  titled: true,
  cardTitled: true,
  hideDownloadButton: null,
  hideParameters: null,
  font: null,
  theme: "light",
};
