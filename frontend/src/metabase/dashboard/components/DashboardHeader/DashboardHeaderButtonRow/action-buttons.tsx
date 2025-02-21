import { DashboardSharingMenu } from "metabase/sharing/components/SharingMenu";
import { Center, Divider } from "metabase/ui";

import { DashboardBookmark } from "../../DashboardBookmark";
import { ExtraEditButtonsMenu } from "../../ExtraEditButtonsMenu";
import { RefreshWidget } from "../../RefreshWidget";
import {
  AddActionElementButton,
  AddFilterParameterButton,
  AddHeadingOrTextButton,
  AddQuestionButton,
  AddSectionButton,
  CopyAnalyticsDashboardButton,
  DashboardActionMenu,
  DashboardInfoButton,
  EditDashboardButton,
  FullscreenAnalyticsDashboard,
  FullscreenToggle,
  NightModeToggleButton,
} from "../buttons";
import { AddLinkOrEmbedButton } from "../buttons/AddLinkOrEmbedButton";

import type { DashboardActionButton, DashboardActionKey } from "./types";

export const DASHBOARD_ACTION = {
  ADD_QUESTION: "ADD_QUESTION",
  ADD_HEADING_OR_TEXT: "ADD_HEADING_OR_TEXT",
  ADD_LINK_CARD: "ADD_LINK_CARD",
  ADD_SECTION: "ADD_SECTION",
  ADD_FILTER_PARAMETER: "ADD_FILTER_PARAMETER",
  ADD_ACTION_ELEMENT: "ADD_ACTION_ELEMENT",
  EXTRA_EDIT_BUTTONS_MENU: "EXTRA_EDIT_BUTTONS_MENU",
  COPY_ANALYTICS_DASHBOARD: "COPY_ANALYTICS_DASHBOARD",
  EDIT_DASHBOARD: "EDIT_DASHBOARD",
  DASHBOARD_SHARING: "DASHBOARD_SHARING",
  REFRESH_WIDGET: "REFRESH_WIDGET",
  NIGHT_MODE_TOGGLE: "NIGHT_MODE_TOGGLE",
  FULLSCREEN_TOGGLE: "FULLSCREEN_TOGGLE",
  DASHBOARD_HEADER_ACTION_DIVIDER: "DASHBOARD_HEADER_ACTION_DIVIDER",
  DASHBOARD_BOOKMARK: "DASHBOARD_BOOKMARK",
  DASHBOARD_INFO: "DASHBOARD_INFO",
  DASHBOARD_ACTION_MENU: "DASHBOARD_ACTION_MENU",
  FULLSCREEN_ANALYTICS_DASHBOARD: "FULLSCREEN_ANALYTICS_DASHBOARD",
} as const;

export const dashboardActionButtons: Record<
  DashboardActionKey,
  DashboardActionButton
> = {
  // ACTIONS WHEN EDITING DASHBOARD
  [DASHBOARD_ACTION.ADD_QUESTION]: {
    component: AddQuestionButton,
    enabled: ({ isEditing }) => isEditing,
  },
  [DASHBOARD_ACTION.ADD_HEADING_OR_TEXT]: {
    component: AddHeadingOrTextButton,
    enabled: ({ isEditing }) => isEditing,
  },
  [DASHBOARD_ACTION.ADD_LINK_CARD]: {
    component: AddLinkOrEmbedButton,
    enabled: ({ isEditing }) => isEditing,
  },
  [DASHBOARD_ACTION.ADD_SECTION]: {
    component: AddSectionButton,
    enabled: ({ isEditing }) => isEditing,
  },
  [DASHBOARD_ACTION.ADD_FILTER_PARAMETER]: {
    component: AddFilterParameterButton,
    enabled: ({ isEditing }) => isEditing,
  },
  [DASHBOARD_ACTION.ADD_ACTION_ELEMENT]: {
    component: AddActionElementButton,
    enabled: ({ isEditing, canEdit, hasModelActionsEnabled }) =>
      isEditing && canEdit && hasModelActionsEnabled,
  },
  [DASHBOARD_ACTION.EXTRA_EDIT_BUTTONS_MENU]: {
    component: ExtraEditButtonsMenu,
    enabled: ({ isEditing }) => isEditing,
  },

  // VIEW ACTIONS
  [DASHBOARD_ACTION.EDIT_DASHBOARD]: {
    component: ({ onRefreshPeriodChange }) => (
      <EditDashboardButton onRefreshPeriodChange={onRefreshPeriodChange} />
    ),
    enabled: ({ isFullscreen, isEditing, canEdit }) =>
      !isFullscreen && !isEditing && canEdit,
  },
  [DASHBOARD_ACTION.DASHBOARD_SHARING]: {
    component: DashboardSharingMenu,
    enabled: ({ isEditing }) => !isEditing,
  },
  [DASHBOARD_ACTION.REFRESH_WIDGET]: {
    component: ({
      refreshPeriod,
      setRefreshElapsedHook,
      onRefreshPeriodChange,
    }) => (
      <RefreshWidget
        period={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onChangePeriod={onRefreshPeriodChange}
      />
    ),
    enabled: ({ dashboard, isEditing }) => !isEditing && !dashboard?.archived,
  },
  [DASHBOARD_ACTION.NIGHT_MODE_TOGGLE]: {
    component: ({ isNightMode, onNightModeChange }) => (
      <NightModeToggleButton
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
      />
    ),
    enabled: ({
      isEditing,
      isFullscreen,
      dashboard,
      hasNightModeToggle,
      onNightModeChange,
    }) =>
      Boolean(
        !isEditing &&
          isFullscreen &&
          !dashboard.archived &&
          hasNightModeToggle &&
          onNightModeChange,
      ),
  },
  [DASHBOARD_ACTION.FULLSCREEN_TOGGLE]: {
    component: ({ isFullscreen, onFullscreenChange }) => (
      <FullscreenToggle
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />
    ),
    enabled: ({ isFullscreen, isPublic, isEmbeddingSdk = false }) =>
      isPublic || isFullscreen || isEmbeddingSdk,
  },
  [DASHBOARD_ACTION.DASHBOARD_BOOKMARK]: {
    component: DashboardBookmark,
    enabled: ({ isEditing, dashboard }) => !isEditing && !dashboard.archived,
  },
  [DASHBOARD_ACTION.DASHBOARD_INFO]: {
    component: DashboardInfoButton,
    enabled: ({ isEditing }) => !isEditing,
  },
  [DASHBOARD_ACTION.DASHBOARD_ACTION_MENU]: {
    component: DashboardActionMenu,
    enabled: ({ isFullscreen, isEditing, isAnalyticsDashboard, dashboard }) =>
      !isFullscreen &&
      !isEditing &&
      !isAnalyticsDashboard &&
      !dashboard.archived,
  },

  // ACTIONS WHEN DASHBOARD IS ANALYTICS DASHBOARD
  [DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD]: {
    component: () => <CopyAnalyticsDashboardButton />,
    enabled: ({ isAnalyticsDashboard = false }) => {
      return isAnalyticsDashboard;
    },
  },
  [DASHBOARD_ACTION.FULLSCREEN_ANALYTICS_DASHBOARD]: {
    component: ({ isFullscreen, onFullscreenChange }) => (
      <FullscreenAnalyticsDashboard
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />
    ),
    enabled: ({ isAnalyticsDashboard = false }) => isAnalyticsDashboard,
  },

  //   UTILITY
  [DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER]: {
    component: () => (
      <Center h="1.25rem" px="sm">
        <Divider orientation="vertical" />
      </Center>
    ),
    enabled: () => true,
  },
};
