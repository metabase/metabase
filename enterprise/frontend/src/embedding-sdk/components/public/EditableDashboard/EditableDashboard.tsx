import { useEffect } from "react";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import type { SdkPluginsConfig } from "embedding-sdk";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { reset as dashboardReset } from "metabase/dashboard/actions";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import { useDispatch } from "metabase/lib/redux";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { Group } from "metabase/ui";

// TODO: Show regular InteractiveDashboard on edit end
// TODO: Plugins and load events

export type EditableDashboardProps = SdkDashboardDisplayProps &
  PublicOrEmbeddedDashboardEventHandlersProps & {
    questionHeight?: number;
    plugins?: SdkPluginsConfig;
    className?: string;
  };

const EditableDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = true,
  hiddenParameters = [],
  onLoad,
  onLoadWithoutCards,
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

  const previousDashboardId = usePrevious(dashboardId);

  useUnmount(() => {
    dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
  });

  useEffect(() => {
    if (previousDashboardId && dashboardId !== previousDashboardId) {
      dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
    }
  }, [dashboardId, dispatch, previousDashboardId]);

  return (
    <Group w="100%" h="100%" ref={ref} className={className}>
      <PublicOrEmbeddedDashboard
        dashboardId={dashboardId}
        parameterQueryParams={initialParameterValues}
        hideParameters={displayOptions.hideParameters}
        background={displayOptions.background}
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
        onLoad={onLoad}
        onLoadWithoutCards={onLoadWithoutCards}
        downloadsEnabled={withDownloads}
        isNightMode={false}
        onNightModeChange={_.noop}
        hasNightModeToggle={false}
        withEdit
      />
    </Group>
  );
};

export const EditableDashboard = withPublicComponentWrapper(
  EditableDashboardInner,
);
