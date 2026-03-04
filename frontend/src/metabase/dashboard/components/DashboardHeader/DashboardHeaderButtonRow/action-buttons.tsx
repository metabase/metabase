import { DashboardSharingMenu } from "metabase/embedding/components/SharingMenu/DashboardSharingMenu";
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
  ExportAsPdfButton,
  FullscreenAnalyticsDashboard,
  FullscreenToggle,
} from "../buttons";
import { AddLinkOrEmbedButton } from "../buttons/AddLinkOrEmbedButton";
import { DashboardSubscriptionsButton } from "../buttons/DashboardSubscriptionsButton";
import { RefreshIndicator } from "../buttons/RefreshIndicator";

import { DASHBOARD_ACTION } from "./dashboard-action-keys";
import type { DashboardActionButton, DashboardActionKey } from "./types";

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
    component: EditDashboardButton,
    enabled: ({ isFullscreen, isEditing, canEdit }) =>
      !isFullscreen && !isEditing && canEdit,
  },
  [DASHBOARD_ACTION.DASHBOARD_SHARING]: {
    component: DashboardSharingMenu,
    enabled: ({ isEditing }) => !isEditing,
  },
  [DASHBOARD_ACTION.REFRESH_WIDGET]: {
    component: () => <RefreshWidget />,
    enabled: ({ dashboard, isEditing }) => !isEditing && !dashboard?.archived,
  },
  [DASHBOARD_ACTION.FULLSCREEN_TOGGLE]: {
    component: FullscreenToggle,
    enabled: ({ isFullscreen, isPublic }) => isPublic || isFullscreen,
  },
  [DASHBOARD_ACTION.DASHBOARD_BOOKMARK]: {
    component: DashboardBookmark,
    enabled: ({ isEditing, dashboard }) => !isEditing && !dashboard.archived,
  },
  [DASHBOARD_ACTION.DASHBOARD_INFO]: {
    component: () => <DashboardInfoButton />,
    enabled: ({ isEditing }) => !isEditing,
  },
  [DASHBOARD_ACTION.DASHBOARD_ACTION_MENU]: {
    component: ({
      canResetFilters,
      onResetFilters,
      canEdit,
      openSettingsSidebar,
    }) => (
      <DashboardActionMenu
        canResetFilters={canResetFilters}
        canEdit={canEdit}
        onResetFilters={onResetFilters}
        openSettingsSidebar={openSettingsSidebar}
      />
    ),
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
    component: FullscreenAnalyticsDashboard,
    enabled: ({ isAnalyticsDashboard = false }) => isAnalyticsDashboard,
  },

  // UTILITY
  [DASHBOARD_ACTION.DASHBOARD_HEADER_ACTION_DIVIDER]: {
    component: () => (
      <Center h="1.25rem" px="sm">
        <Divider orientation="vertical" />
      </Center>
    ),
    enabled: () => true,
  },
  DOWNLOAD_PDF: {
    component: () => <ExportAsPdfButton />,
    enabled: ({ downloadsEnabled }) => Boolean(downloadsEnabled.pdf),
  },
  // Modular embedding
  [DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS]: {
    enabled: ({ withSubscriptions }) => withSubscriptions,
    component: () => <DashboardSubscriptionsButton />,
  },
  [DASHBOARD_ACTION.REFRESH_INDICATOR]: {
    enabled: ({ refreshPeriod }) => refreshPeriod != null && refreshPeriod > 0,
    component: () => <RefreshIndicator />,
  },
};
