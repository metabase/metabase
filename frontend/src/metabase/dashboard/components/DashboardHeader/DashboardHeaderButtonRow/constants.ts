import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-buttons";

export const DASHBOARD_DISPLAY_ACTIONS = [
  DASHBOARD_ACTION.DASHBOARD_EMBED_ACTION,
  DASHBOARD_ACTION.REFRESH_WIDGET,
  DASHBOARD_ACTION.NIGHT_MODE_TOGGLE,
  DASHBOARD_ACTION.FULLSCREEN_TOGGLE,
];

export const DASHBOARD_EDITING_ACTIONS = [
  DASHBOARD_ACTION.ADD_QUESTION,
  DASHBOARD_ACTION.ADD_HEADING_OR_TEXT,
  DASHBOARD_ACTION.ADD_LINK_CARD,
  DASHBOARD_ACTION.ADD_SECTION,
  DASHBOARD_ACTION.ADD_FILTER_PARAMETER,
  DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
  DASHBOARD_ACTION.ADD_ACTION_ELEMENT,
  DASHBOARD_ACTION.EXTRA_EDIT_BUTTONS_MENU,
];

export const SDK_DASHBOARD_VIEW_ACTIONS = [
  DASHBOARD_ACTION.EDIT_DASHBOARD,
  ...DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_ACTION.EXPORT_AS_PDF,
];

export const DASHBOARD_VIEW_ACTIONS = [
  DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD,
  DASHBOARD_ACTION.EDIT_DASHBOARD,
  DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTION,
  ...DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_ACTION.EXPORT_AS_PDF,
  DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER,
  DASHBOARD_ACTION.DASHBOARD_BOOKMARK,
  DASHBOARD_ACTION.DASHBOARD_INFO,
  DASHBOARD_ACTION.DASHBOARD_ACTION_MENU,
  DASHBOARD_ACTION.FULLSCREEN_ANALYTICS_DASHBOARD,
];
