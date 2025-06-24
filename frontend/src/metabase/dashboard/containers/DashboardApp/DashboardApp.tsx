import cx from "classnames";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import type { Route, WithRouterProps } from "react-router";
import { push } from "react-router-redux";

import ErrorBoundary from "metabase/ErrorBoundary";
import CS from "metabase/css/core/index.css";
import {
  addCardToDashboard,
  navigateToNewCardFromDashboard,
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
import { useFavicon } from "metabase/hooks/use-favicon";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import type { DashboardId, Dashboard as IDashboard } from "metabase-types/api";

import { useRegisterDashboardMetabotContext } from "../../hooks/use-register-dashboard-metabot-context";
import { getFavicon } from "../../selectors";

import { DashboardTitle } from "./DashboardTitle";
import { useSlowCardNotification } from "./use-slow-card-notification";

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
    theme,
    setTheme,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  useRegisterDashboardMetabotContext();
  useDashboardUrlQuery(router, location);

  const onLoadDashboard = (dashboard: IDashboard) => {
    try {
      if (editingOnLoad) {
        onRefreshPeriodChange(null);
        dispatch(setEditingDashboard(dashboard));
        dispatch(push({ ...location, hash: "" }));
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
        theme={theme}
        setTheme={setTheme}
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
        onError={(error) => dispatch(setErrorPage(error))}
        navigateToNewCardFromDashboard={(opts) =>
          dispatch(navigateToNewCardFromDashboard(opts))
        }
      >
        <DashboardTitle />
        <DashboardFavicon />
        <DashboardNotifications />
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

function DashboardFavicon() {
  const pageFavicon = useSelector(getFavicon);
  useFavicon({ favicon: pageFavicon });
  return null;
}

function DashboardNotifications() {
  useSlowCardNotification();
  return null;
}
