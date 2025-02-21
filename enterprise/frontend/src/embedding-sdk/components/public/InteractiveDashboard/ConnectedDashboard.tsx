import type { Query } from "history";
import { type ComponentType, type FC, useEffect } from "react";
import type { ConnectedProps } from "react-redux";
import _ from "underscore";

import type { MetabasePluginsConfig } from "embedding-sdk";
import {
  DashboardNotFoundError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import * as dashboardActions from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAddParameterPopoverOpen,
  getIsAdditionalInfoVisible,
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
  DashboardLoaderWrapperProps,
  DashboardRefreshPeriodControls,
} from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { connect } from "metabase/lib/redux";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getErrorPage, getIsNavbarOpen } from "metabase/selectors/app";
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

type ConnectedDashboardProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Query;

  downloadsEnabled?: boolean;
  onNavigateToNewCardFromDashboard: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;

  plugins?: MetabasePluginsConfig;
  className?: string;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardLoaderWrapperProps &
  PublicOrEmbeddedDashboardEventHandlersProps;

const ConnectedDashboardInner = ({
  dashboard,
  onLoad,
  onLoadWithoutCards,
  onNavigateToNewCardFromDashboard,
  ...restProps
}: ConnectedDashboardProps & ReduxProps) => {
  useDashboardLoadHandlers({ dashboard, onLoad, onLoadWithoutCards });

  return (
    <Dashboard
      dashboard={dashboard}
      {...restProps}
      isNightMode={false}
      onNightModeChange={_.noop}
      hasNightModeToggle={false}
      navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
      autoScrollToDashcardId={undefined}
      reportAutoScrolledToDashcard={_.noop}
    />
  );
};

export const ConnectedDashboard = connector<
  ComponentType<ConnectedDashboardProps & ReduxProps>
>(({ dashboardId: initialDashboardId, ...rest }) => {
  const { id: resolvedDashboardId, isLoading } = useValidatedEntityId({
    type: "dashboard",
    id: initialDashboardId,
  });

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (resolvedDashboardId) {
      dispatch(setErrorPage(null));
    }
  }, [dispatch, resolvedDashboardId]);

  if (isLoading) {
    return <SdkLoader />;
  }

  if (!resolvedDashboardId || errorPage?.status === 404) {
    return <DashboardNotFoundError id={initialDashboardId} />;
  }

  return (
    <ConnectedDashboardInner dashboardId={resolvedDashboardId} {...rest} />
  );
}) as FC<ConnectedDashboardProps>;
