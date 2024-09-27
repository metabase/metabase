import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";
import type { ConnectedProps } from "react-redux";
import { connect } from "react-redux";
import type { Route, WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import {
  useDashboardUrlParams,
  useDashboardUrlQuery,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import favicon from "metabase/hoc/Favicon";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useWebNotification } from "metabase/hooks/use-web-notification";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { getIsNavbarOpen } from "metabase/selectors/app";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import * as dashboardActions from "../../actions";
import { DASHBOARD_SLOW_TIMEOUT } from "../../constants";
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
} from "../../selectors";

type OwnProps = {
  dashboardId?: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
};

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
  onChangeLocation: push,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

type DashboardAppProps = OwnProps & ReduxProps & WithRouterProps;

const DashboardApp = (props: DashboardAppProps) => {
  const {
    dashboard,
    isRunning,
    isLoadingComplete,
    isEditing,
    isDirty,
    route,
    router,
  } = props;

  const {
    documentTitle: _documentTitle,
    pageFavicon: _pageFavicon,
    isRunning: _isRunning,
    isLoadingComplete: _isLoadingComplete,
    children,
    location,
    ...dashboardProps
  } = props;

  const parameterQueryParams = location.query;
  const dashboardId = getDashboardId(props);
  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

  const dispatch = useDispatch();

  const { requestPermission, showNotification } = useWebNotification();

  useUnmount(() => {
    dispatch(dashboardActions.reset());
    dispatch(dashboardActions.closeDashboard());
  });

  const slowToastId = useUniqueId();

  useEffect(() => {
    if (isLoadingComplete) {
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        showNotification(
          t`All Set! ${dashboard?.name} is ready.`,
          t`All questions loaded`,
        );
      }
    }

    return () => {
      dispatch(dismissUndo({ undoId: slowToastId }));
    };
  }, [
    dashboard?.name,
    dispatch,
    isLoadingComplete,
    showNotification,
    slowToastId,
  ]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    dispatch(dismissUndo({ undoId: slowToastId }));
  }, [dispatch, requestPermission, slowToastId]);

  const onTimeout = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      dispatch(
        addUndo({
          id: slowToastId,
          timeout: false,
          message: t`Would you like to be notified when this dashboard is done loading?`,
          action: onConfirmToast,
          actionLabel: t`Turn on`,
        }),
      );
    }
  }, [dispatch, onConfirmToast, slowToastId]);

  useLoadingTimer(isRunning, {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboardId,
    parameterQueryParams,
  });

  const {
    hasNightModeToggle,
    isFullscreen,
    isNightMode,
    onNightModeChange,
    refreshPeriod,
    onFullscreenChange,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  useDashboardUrlQuery(router, location);

  return (
    <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
      <DashboardLeaveConfirmationModal
        route={route}
        isDirty={isDirty}
        isEditing={isEditing}
      />
      <Dashboard
        dashboardId={dashboardId}
        editingOnLoad={editingOnLoad}
        addCardOnLoad={addCardOnLoad}
        isFullscreen={isFullscreen}
        refreshPeriod={refreshPeriod}
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        parameterQueryParams={parameterQueryParams}
        {...dashboardProps}
      />
      {/* For rendering modal urls */}
      {props.children}
    </div>
  );
};

function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }

  return Urls.extractEntityId(params.slug) as DashboardId;
}

export const DashboardAppConnected = _.compose(
  connector,
  favicon(({ pageFavicon }: Pick<ReduxProps, "pageFavicon">) => pageFavicon),
  title(
    ({
      dashboard,
      documentTitle,
    }: Pick<ReduxProps, "dashboard" | "documentTitle">) => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    }),
  ),
  titleWithLoadingTime("loadingStartTime"),
)(DashboardApp);
