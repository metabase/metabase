export const SIDEBAR_NAME = {
  addQuestion: "addQuestion",
  action: "action",
  clickBehavior: "clickBehavior",
  editParameter: "editParameter",
  sharing: "sharing",
  info: "info",
};
export const INITIAL_DASHBOARD_STATE = {
  dashboardId: null,
  selectedTabId: null,
  isEditing: null,
  dashboards: {},
  dashcards: [],
  dashcardData: {},
  parameterValues: {},
  loadingDashCards: {
    dashcardIds: [],
    loadingIds: [],
    loadingStatus: "running" as const,
    startTime: null,
  },
  loadingControls: {},
  isAddParameterPopoverOpen: false,
  slowCards: {},
  sidebar: { props: {} },
};
