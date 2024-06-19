import type { Query } from "history";
import { pick } from "underscore";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import {
  DEFAULT_EMBED_DISPLAY_OPTIONS,
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { isNotNull } from "metabase/lib/types";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { Box } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

type StaticDashboardInnerProps = {
  dashboardId: DashboardId;
  initialParameterValues?: Query;
  withTitle?: boolean;
  withCardTitle?: boolean;
  withDownloads?: boolean;
  hiddenParameters?: string[];

  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
};

export type StaticDashboardProps = Omit<
  StaticDashboardInnerProps,
  "navigateToNewCardFromDashboard"
>;

export const _StaticDashboard = ({
  dashboardId,
  initialParameterValues: parameterQueryParams = {},
  withTitle: titled = true,
  withCardTitle = true,
  withDownloads = true,
  hiddenParameters = [],
  navigateToNewCardFromDashboard,
}: StaticDashboardInnerProps) => {
  // temporary name until we change `hideDownloadButton` to `downloads`
  const hideDownloadButton = !withDownloads;

  const options: EmbedDisplayParams = {
    ...DEFAULT_EMBED_DISPLAY_OPTIONS,
    ...pick(
      {
        titled,
        hideDownloadButton,
        hideParameters: hiddenParameters.join(",") ?? null,
      },
      isNotNull,
    ),
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams,
  });
  const { isFullscreen, onFullscreenChange, ref } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({
      onRefresh: refreshDashboard,
    });

  const { hasNightModeToggle, isNightMode, onNightModeChange, theme } =
    useEmbedTheme();

  const { font } = useEmbedFont();

  return (
    <Box w="100%" ref={ref} className={CS.overflowAuto}>
      <PublicOrEmbeddedDashboard
        dashboardId={dashboardId}
        parameterQueryParams={parameterQueryParams}
        hasNightModeToggle={hasNightModeToggle}
        hideDownloadButton={options.hideDownloadButton}
        hideParameters={options.hideParameters}
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
        titled={options.titled}
        cardTitled={withCardTitle}
        theme={theme}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        font={font}
        bordered={options.bordered}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      />
    </Box>
  );
};

const StaticDashboard = withPublicComponentWrapper(
  _StaticDashboard,
) as React.FC<StaticDashboardProps>;

export { EmbedDisplayParams, StaticDashboard };
