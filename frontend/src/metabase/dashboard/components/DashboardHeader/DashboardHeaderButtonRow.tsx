import type { ReactNode } from "react";
import { withRouter, type WithRouterProps } from "react-router";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { RefreshWidgetButton } from "metabase/dashboard/components/DashboardActions.styled";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction";
import {
  getDashboardComplete,
  getHasModelActionsEnabled,
  getIsEditing,
} from "metabase/dashboard/selectors";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedThemeControls,
} from "metabase/dashboard/types";
import { useSelector } from "metabase/lib/redux";
import { getPulseFormInput } from "metabase/pulse/selectors";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { Collection, Dashboard } from "metabase-types/api";

import { DashboardBookmark } from "../DashboardBookmark";
import { ExtraEditButtonsMenu } from "../ExtraEditButtonsMenu/ExtraEditButtonsMenu";

import { DashboardHeaderActionDivider } from "./DashboardHeader.styled";
import {
  AddActionElementButton,
  AddFilterParameterButton,
  AddHeadingOrTextButton,
  AddLinkCardButton,
  AddQuestionButton,
  AddSectionButton,
  AddTemporalUnitButton,
  CopyAnalyticsDashboardButton,
  DashboardActionMenu,
  DashboardInfoButton,
  DashboardSubscriptionButton,
  EditDashboardButton,
  FullscreenAnalyticsDashboard,
  getExtraButtons,
  shouldRenderSubscriptionButton,
  FullscreenToggle,
  NightModeToggleButton,
} from "./buttons";

export const BUTTON_CONFIG = {
  ADD_QUESTION: "ADD_QUESTION",
  ADD_HEADING_OR_TEXT: "ADD_HEADING_OR_TEXT",
  ADD_LINK_CARD: "ADD_LINK_CARD",
  ADD_SECTION: "ADD_SECTION",
  ADD_TEMPORAL_UNIT: "ADD_TEMPORAL_UNIT",
  ADD_FILTER_PARAMETER: "ADD_FILTER_PARAMETER",
  ADD_ACTION_ELEMENT: "ADD_ACTION_ELEMENT",
  EXTRA_EDIT_BUTTONS_MENU: "EXTRA_EDIT_BUTTONS_MENU",
  COPY_ANALYTICS_DASHBOARD: "COPY_ANALYTICS_DASHBOARD",
  EDIT_DASHBOARD: "EDIT_DASHBOARD",
  DASHBOARD_SUBSCRIPTION: "DASHBOARD_SUBSCRIPTION",
  DASHBOARD_EMBED_ACTION: "DASHBOARD_EMBED_ACTION",
  REFRESH_WIDGET: "REFRESH_WIDGET",
  NIGHT_MODE_TOGGLE: "NIGHT_MODE_TOGGLE",
  FULLSCREEN_TOGGLE: "FULLSCREEN_TOGGLE",
  DASHBOARD_HEADER_ACTION_DIVIDER: "DASHBOARD_HEADER_ACTION_DIVIDER",
  DASHBOARD_BOOKMARK: "DASHBOARD_BOOKMARK",
  DASHBOARD_INFO: "DASHBOARD_INFO",
  DASHBOARD_ACTION_MENU: "DASHBOARD_ACTION_MENU",
  FULLSCREEN_ANALYTICS_DASHBOARD: "FULLSCREEN_ANALYTICS_DASHBOARD",
} as const;

type ButtonKey = keyof typeof BUTTON_CONFIG;

type DashboardHeaderButtonRowProps = WithRouterProps & {
  collection?: Collection;
  isEmpty?: boolean;
  isPublic?: boolean;
} & DashboardRefreshPeriodControls &
  DashboardFullscreenControls &
  Pick<
    EmbedThemeControls,
    "hasNightModeToggle" | "isNightMode" | "onNightModeChange"
  >;

type HeaderButtonProps = {
  isEditing: boolean;
  canEdit: boolean;
  hasModelActionsEnabled: boolean;
  isAnalyticsDashboard: boolean;
  dashboard: Dashboard;
  canManageSubscriptions: boolean;
  formInput: any;
  isAdmin: boolean;
} & DashboardHeaderButtonRowProps;

type ButtonConfig = {
  component: (props: HeaderButtonProps) => ReactNode;
  enabled: (props: HeaderButtonProps) => boolean;
};

const buttonConfigs: Record<ButtonKey, ButtonConfig> = {
  [BUTTON_CONFIG.ADD_QUESTION]: {
    component: () => <AddQuestionButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_HEADING_OR_TEXT]: {
    component: () => <AddHeadingOrTextButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_LINK_CARD]: {
    component: () => <AddLinkCardButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_SECTION]: {
    component: () => <AddSectionButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_TEMPORAL_UNIT]: {
    component: () => <AddTemporalUnitButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_FILTER_PARAMETER]: {
    component: () => <AddFilterParameterButton />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.ADD_ACTION_ELEMENT]: {
    component: () => <AddActionElementButton />,
    enabled: ({ isEditing, canEdit, hasModelActionsEnabled }) =>
      isEditing && canEdit && hasModelActionsEnabled,
  },
  [BUTTON_CONFIG.EXTRA_EDIT_BUTTONS_MENU]: {
    component: () => <ExtraEditButtonsMenu />,
    enabled: ({ isEditing }) => isEditing,
  },
  [BUTTON_CONFIG.COPY_ANALYTICS_DASHBOARD]: {
    component: () => <CopyAnalyticsDashboardButton />,
    enabled: ({ isAnalyticsDashboard }) => isAnalyticsDashboard,
  },
  [BUTTON_CONFIG.EDIT_DASHBOARD]: {
    component: ({ onRefreshPeriodChange }) => (
      <EditDashboardButton onRefreshPeriodChange={onRefreshPeriodChange} />
    ),
    enabled: ({ isFullscreen, isEditing, canEdit }) =>
      !isFullscreen && !isEditing && canEdit,
  },
  [BUTTON_CONFIG.DASHBOARD_SUBSCRIPTION]: {
    component: () => <DashboardSubscriptionButton />,
    enabled: ({
      dashboard,
      canManageSubscriptions,
      formInput,
      isAdmin,
      isEditing,
      isFullscreen,
    }) =>
      shouldRenderSubscriptionButton({
        dashboard,
        canManageSubscriptions,
        formInput,
        isAdmin,
        isEditing,
        isFullscreen,
      }),
  },
  [BUTTON_CONFIG.DASHBOARD_EMBED_ACTION]: {
    component: () => <DashboardEmbedAction />,
    enabled: ({ dashboard, isPublic, isEmpty }) =>
      !isEmpty && !isPublic && dashboard && !dashboard?.archived,
  },
  [BUTTON_CONFIG.REFRESH_WIDGET]: {
    component: ({
      refreshPeriod,
      setRefreshElapsedHook,
      onRefreshPeriodChange,
    }) => (
      <RefreshWidgetButton
        period={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onChangePeriod={onRefreshPeriodChange}
      />
    ),
    enabled: ({ dashboard, isEmpty }) => !isEmpty && !dashboard?.archived,
  },
  [BUTTON_CONFIG.NIGHT_MODE_TOGGLE]: {
    component: ({ isNightMode, onNightModeChange }) => (
      <NightModeToggleButton
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
      />
    ),
    enabled: ({
      isFullscreen,
      dashboard,
      hasNightModeToggle,
      onNightModeChange,
    }) =>
      Boolean(
        isFullscreen &&
          !dashboard.archived &&
          hasNightModeToggle &&
          !!onNightModeChange,
      ),
  },
  [BUTTON_CONFIG.FULLSCREEN_TOGGLE]: {
    component: ({ isFullscreen, onFullscreenChange }) => (
      <FullscreenToggle
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />
    ),
    enabled: ({ isFullscreen, isEmpty, isPublic }) =>
      !isEmpty && (isPublic || isFullscreen),
  },
  [BUTTON_CONFIG.DASHBOARD_HEADER_ACTION_DIVIDER]: {
    component: () => <DashboardHeaderActionDivider />,
    enabled: ({ isEditing }) => !isEditing,
  },
  [BUTTON_CONFIG.DASHBOARD_BOOKMARK]: {
    component: () => <DashboardBookmark />,
    enabled: ({ isEditing, dashboard }) => !isEditing && !dashboard.archived,
  },
  [BUTTON_CONFIG.DASHBOARD_INFO]: {
    component: () => <DashboardInfoButton />,
    enabled: ({ isEditing }) => !isEditing,
  },
  [BUTTON_CONFIG.DASHBOARD_ACTION_MENU]: {
    component: ({
      onFullscreenChange,
      isFullscreen,
      dashboard,
      canEdit,
      location,
    }) => (
      <DashboardActionMenu
        items={getExtraButtons({
          onFullscreenChange,
          isFullscreen,
          dashboard,
          canEdit,
          pathname: location.pathname,
        })}
      />
    ),
    enabled: ({ isFullscreen, isEditing, isAnalyticsDashboard, dashboard }) =>
      !isFullscreen &&
      !isEditing &&
      !isAnalyticsDashboard &&
      !dashboard.archived,
  },
  [BUTTON_CONFIG.FULLSCREEN_ANALYTICS_DASHBOARD]: {
    component: ({ isFullscreen, onFullscreenChange }) => (
      <FullscreenAnalyticsDashboard
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />
    ),
    enabled: ({ isAnalyticsDashboard }) => isAnalyticsDashboard,
  },
};

export const DashboardHeaderButtonRow = withRouter(
  ({
    buttonKeys = null,
    isPublic = false,
    isEmpty = false,
    ...props
  }: {
    buttonKeys?: ButtonKey[] | null;
  } & DashboardHeaderButtonRowProps) => {
    const formInput = useSelector(getPulseFormInput);
    const isAdmin = useSelector(getUserIsAdmin);
    const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

    const dashboard = useSelector(getDashboardComplete);
    const canEdit = Boolean(dashboard?.can_write && !dashboard?.archived);
    const isAnalyticsDashboard = isInstanceAnalyticsCollection(
      props.collection,
    );

    const hasModelActionsEnabled = useSelector(getHasModelActionsEnabled);

    const isEditing = useSelector(getIsEditing);

    const visibleKeys: ButtonKey[] =
      buttonKeys || (Object.keys(buttonConfigs) as ButtonKey[]);

    return (
      <>
        {visibleKeys.map(key => {
          const config = buttonConfigs[key];
          if (config && dashboard) {
            const buttonComponentProps: HeaderButtonProps = {
              isEditing,
              canEdit,
              hasModelActionsEnabled,
              isAnalyticsDashboard,
              dashboard,
              canManageSubscriptions,
              formInput,
              isAdmin,
              isPublic,
              isEmpty,
              ...props,
            };

            if (config.enabled(buttonComponentProps)) {
              return config.component(buttonComponentProps);
            }
          }
          return null;
        })}
      </>
    );
  },
);
