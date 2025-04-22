import cx from "classnames";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import type { Route, WithRouterProps } from "react-router";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import {
  addCardToDashboard,
  setEditingDashboard,
} from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { DashboardContextProvider } from "metabase/dashboard/context";
import {
  useDashboardUrlParams,
  useDashboardUrlQuery,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { SuccessfulFetchDashboardResult } from "metabase/dashboard/types";
import { useFavicon } from "metabase/hooks/use-favicon";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import type { DashboardId } from "metabase-types/api";

import { getFavicon } from "../../selectors";

import { DashboardTitle } from "./DashboardTitle";

interface DashboardAppProps extends PropsWithChildren {
  dashboardId?: DashboardId;
  route: Route;
}

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
    <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
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
          autoScrollToDashcardId={autoScrollToDashcardId}
          reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
          onLoad={onLoadDashboard}
          onError={(result) => dispatch(setErrorPage(result.payload))}
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
    </div>
  );
};
