import cx from "classnames";
import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Route, WithRouterProps } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import {
  addCardToDashboard,
  setEditingDashboard,
} from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import {
  useDashboardUrlParams,
  useDashboardUrlQuery,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { SuccessfulFetchDashboardResult } from "metabase/dashboard/types";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useFavicon } from "metabase/hooks/use-favicon";
import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useWebNotification } from "metabase/hooks/use-web-notification";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type { DashboardId } from "metabase-types/api";

import { DASHBOARD_SLOW_TIMEOUT } from "../../constants";
import { getFavicon } from "../../selectors";

interface DashboardAppProps extends PropsWithChildren {
  dashboardId?: DashboardId;
  route: Route;
}

const useSlowCardNotification = () => {
  const { dashboard, isRunning, isLoadingComplete } = useDashboardContext();

  const dispatch = useDispatch();

  const { requestPermission, showNotification } = useWebNotification();

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
};

export const DashboardApp = ({
  location,
  params,
  router,
  route,
  dashboardId: _dashboardId,
  children,
}: DashboardAppProps & WithRouterProps<{ slug: string }>) => {
  const dispatch = useDispatch();

  const [error, setError] = useState<string>();

  const favicon = useSelector(getFavicon);
  useFavicon({ favicon });

  const parameterQueryParams = location.query;
  const dashboardId =
    _dashboardId || (Urls.extractEntityId(params.slug) as DashboardId);

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
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
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
    downloadsEnabled,
    background,
    bordered,
    titled,
    theme,
    setTheme,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  useDashboardUrlQuery(router, location);

  const onLoadDashboard = (result: SuccessfulFetchDashboardResult) => {
    const dashboard = result.payload.dashboard;

    try {
      if (editingOnLoad) {
        onRefreshPeriodChange(null);
        setEditingDashboard(dashboard);
      }
      if (addCardOnLoad != null) {
        const searchParams = new URLSearchParams(window.location.search);
        const tabParam = searchParams.get("tab");
        const tabId = tabParam ? parseInt(tabParam, 10) : null;

        dispatch(
          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId,
          }),
        );
      }
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        setErrorPage({ ...error, context: "dashboard" });
      } else {
        console.error(error);
        setError(error as string);
      }
    }
  };

  return (
    <ErrorBoundary message={error}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={parameterQueryParams}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        hasNightModeToggle={hasNightModeToggle}
        onNightModeChange={onNightModeChange}
        isNightMode={isNightMode}
        refreshPeriod={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onRefreshPeriodChange={onRefreshPeriodChange}
        background={background}
        bordered={bordered}
        titled={titled}
        theme={theme}
        setTheme={setTheme}
        downloadsEnabled={downloadsEnabled}
        autoScrollToDashcardId={autoScrollToDashcardId}
        reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
        onLoad={onLoadDashboard}
        onError={(result) => dispatch(setErrorPage(result.payload))}
        hideParameters={null}
        font={null}
      >
        <DashboardTitle />
        <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
          <DashboardLeaveConfirmationModal route={route} />
          <Dashboard />
          {/* For rendering modal urls */}
          {children}
        </div>
      </DashboardContextProvider>
    </ErrorBoundary>
  );
};

const DashboardTitle = () => {
  const { dashboard, documentTitle, pageFavicon } = useDashboardContext();

  useFavicon({ favicon: pageFavicon });
  useSlowCardNotification();

  const Component = _.compose(
    title(() => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    })),
    titleWithLoadingTime("loadingStartTime"),
  )(() => null);

  return <Component />;
};
