import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import type { SdkPluginsConfig } from "embedding-sdk";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import {
  NAVIGATE_TO_NEW_CARD,
  reset as dashboardReset,
} from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import { useDispatch, useStore } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { QuestionDashboardCard } from "metabase-types/api";

export type EditableDashboardProps = SdkDashboardDisplayProps &
  PublicOrEmbeddedDashboardEventHandlersProps & {
    questionHeight?: number;
    plugins?: SdkPluginsConfig;
    className?: string;
  };

const EditableDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  // withTitle = true,
  // withCardTitle = true,
  // withDownloads = true,
  // hiddenParameters = [],
  // questionHeight,
  // plugins,
  // onLoad,
  // onLoadWithoutCards,
  className,
}: EditableDashboardProps) => {
  const {
    displayOptions,
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
  } = useSdkDashboardParams({
    dashboardId,
    withDownloads,
    withTitle,
    hiddenParameters,
    initialParameterValues,
  });
  const dispatch = useDispatch();
  const { theme } = useEmbedTheme();

  const { font } = useEmbedFont();

  const store = useStore();
  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState<string | null>(null);

  const globalPlugins = useSdkSelector(getPlugins);

  const previousDashboardId = usePrevious(dashboardId);

  useUnmount(() => {
    dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
  });

  useEffect(() => {
    if (previousDashboardId && dashboardId !== previousDashboardId) {
      dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
      setAdhocQuestionUrl(null);
    }
  }, [dashboardId, dispatch, previousDashboardId]);

  const handleNavigateToNewCardFromDashboard = ({
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: NavigateToNewCardFromDashboardOpts) => {
    const state = store.getState();
    const metadata = getMetadata(state);
    const { dashboards, parameterValues } = state.dashboard;
    const dashboard = dashboards[dashboardId];

    if (dashboard) {
      const url = getNewCardUrl({
        metadata,
        dashboard,
        parameterValues,
        nextCard,
        previousCard,
        dashcard: dashcard as QuestionDashboardCard,
        objectId,
      });

      if (url) {
        dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { dashboardId } });
        setAdhocQuestionUrl(url);
      }
    }
  };

  const handleNavigateBackToDashboard = () => {
    dispatch(navigateBackToDashboard(dashboardId)); // set global state for cases when navigate back from question with empty results

    setAdhocQuestionUrl(null);
  };

  const onEditQuestion = useCallback(
    (question: Question) => setAdhocQuestionUrl(Urls.question(question.card())),
    [],
  );

  const providerPlugins = useMemo(() => {
    return { ...globalPlugins, ...plugins };
  }, [globalPlugins, plugins]);

  return (
    <Box w="100%" h="100%" ref={ref} className={className}>
      <Dashboard
        dashboardId={dashboardId}
        editingOnLoad={false}
        isFullscreen={isFullscreen}
        refreshPeriod={refreshPeriod}
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        parameterQueryParams={parameterQueryParams}
        addCardToDashboard={}
      />
    </Box>
  );
};

export const EditableDashboard = withPublicComponentWrapper(
  EditableDashboardInner,
);
