import type {
  DashboardSidebarName,
  DashboardState,
} from "metabase-types/store";

import type { EmbedDisplayParams } from "./types";

export const DASHBOARD_NAME_MAX_LENGTH = 254;
export const DASHBOARD_DESCRIPTION_MAX_LENGTH = 1500;

export const SIDEBAR_NAME: Record<DashboardSidebarName, DashboardSidebarName> =
  {
    addQuestion: "addQuestion",
    action: "action",
    clickBehavior: "clickBehavior",
    editParameter: "editParameter",
    sharing: "sharing",
    settings: "settings",
    info: "info",
    analyze: "analyze",
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
  loadingControls: {
    isLoading: false,
  },
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
export const DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID =
  "Dashboard-Parameters-Content";
export const DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME =
  "Dashboard-Parameters-List";

export const DEFAULT_DASHBOARD_DISPLAY_OPTIONS: EmbedDisplayParams = {
  background: true,
  bordered: false,
  titled: true,
  cardTitled: true,
  hideParameters: null,
  font: null,
  theme: "light",
  downloadsEnabled: { pdf: true, results: true },
  // TODO: (Kelvin 2025-11-17) this will be removed when I work on EMB-1025
  withSubscriptions: true,
  withFooter: true,
  getClickActionMode: undefined,
};
