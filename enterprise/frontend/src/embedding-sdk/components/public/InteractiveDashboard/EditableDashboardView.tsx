import type { Query } from "history";
import type React from "react";
import { connect, type ConnectedProps } from "react-redux";
import _ from "underscore";

import type { SdkPluginsConfig } from "embedding-sdk";
import * as dashboardActions from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAdditionalInfoVisible,
  getIsAddParameterPopoverOpen,
  getIsDashCardsLoadingComplete,
  getIsDashCardsRunning,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsNavigatingBackToDashboard,
  getIsSharing,
  getLoadingStartTime,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "metabase/dashboard/selectors";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
} from "metabase/dashboard/types";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

const mapStateToProps = (state: State) => {
  return {
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state),
    isSharing: getIsSharing(state),
    dashboardBeforeEditing: getDashboardBeforeEditing(state),
    isEditingParameter: getIsEditingParameter(state),
    isDirty: getIsDirty(state),
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameterValues: getParameterValues(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsDashCardsRunning(state),
    isLoadingComplete: getIsDashCardsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  closeNavbar,
  setErrorPage,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

type EditableDashboardViewProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Query;

  downloadsEnabled?: boolean;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;

  questionHeight?: number;
  plugins?: SdkPluginsConfig;
  className?: string;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  PublicOrEmbeddedDashboardEventHandlersProps;

const EditableDashboardViewInner = ({
  dashboard,
  onLoad,
  onLoadWithoutCards,
  ...restProps
}: EditableDashboardViewProps & ReduxProps) => {
  useDashboardLoadHandlers({ dashboard, onLoad, onLoadWithoutCards });

  return (
    <Dashboard
      dashboard={dashboard}
      isNightMode={false}
      onNightModeChange={_.noop}
      hasNightModeToggle={false}
      onSetErrorPage={console.error}
      {...restProps}
    />
  );
};

export const EditableDashboardView = connector(
  EditableDashboardViewInner,
) as React.FC<EditableDashboardViewProps>;
