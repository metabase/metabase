import { useState } from "react";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import CS from "metabase/css/core/index.css";
import { NAVIGATE_TO_NEW_CARD } from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import { useDispatch, useStore } from "metabase/lib/redux";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import type { QuestionDashboardCard } from "metabase-types/api";

export type InteractiveDashboardProps = SdkDashboardDisplayProps & {
  questionHeight?: number;
  questionPlugins?: SdkClickActionPluginsConfig;
};

const InteractiveDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = true,
  hiddenParameters = [],
  questionHeight,
  questionPlugins,
}: InteractiveDashboardProps) => {
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

  if (adhocQuestionUrl) {
    return (
      <InteractiveAdHocQuestion
        isOpenedFromDashboard
        questionPath={adhocQuestionUrl}
        withTitle={withTitle}
        height={questionHeight}
        plugins={questionPlugins}
        onNavigateBack={() => setAdhocQuestionUrl(null)}
      />
    );
  }

  return (
    <Box w="100%" ref={ref} className={CS.overflowAuto}>
      <PublicOrEmbeddedDashboard
        dashboardId={dashboardId}
        parameterQueryParams={initialParameterValues}
        hideDownloadButton={displayOptions.hideDownloadButton}
        hideParameters={displayOptions.hideParameters}
        titled={displayOptions.titled}
        cardTitled={withCardTitle}
        theme={theme}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        font={font}
        bordered={displayOptions.bordered}
        navigateToNewCardFromDashboard={handleNavigateToNewCardFromDashboard}
      />
    </Box>
  );
};

export const InteractiveDashboard = withPublicComponentWrapper(
  InteractiveDashboardInner,
);
