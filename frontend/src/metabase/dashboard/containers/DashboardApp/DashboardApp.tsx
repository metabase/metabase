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
  toggleSidebar,
} from "metabase/dashboard/actions";
import { canEditQuestion } from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
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
import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import { setErrorPage } from "metabase/redux/app";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  isVisualizerDashboardCard,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";
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
        onAddQuestion={(dashboard: IDashboard | null) => {
          dispatch(setEditingDashboard(dashboard));
          dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion));
        }}
        dashcardMenu={{
          "edit-visualization": ({ dashcard }) =>
            isVisualizerSupportedVisualization(dashcard.card.display),
          "edit-link": ({ dashcard, question }) =>
            !isVisualizerSupportedVisualization(dashcard.card.display) &&
            !!question &&
            canEditQuestion(question),
          download: ({ series }) => !!series[0]?.data && !series[0]?.error,
          metabot: ({ question }) =>
            !!question &&
            PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question),
          "view-underlying-question": ({
            dashboard: _dashboard,
            dashcard,
            question: _question,
            series,
          }) => {
            const settings = getComputedSettingsForSeries(
              series,
            ) as ComputedVisualizationSettings;
            const title = settings["card.title"] ?? series?.[0].card.name ?? "";

            return !title && isVisualizerDashboardCard(dashcard);
          },
        }}
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
