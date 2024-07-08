import type { Query } from "history";
import { pick } from "underscore";

import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { isNotNull } from "metabase/lib/types";
import type { DashboardId } from "metabase-types/api";

export type SdkDashboardDisplayProps = {
  dashboardId: DashboardId;
  initialParameterValues?: Query;
  withTitle?: boolean;
  withCardTitle?: boolean;
  withDownloads?: boolean;
  hiddenParameters?: string[];
};

export const useSdkDashboardParams = ({
  dashboardId,
  withDownloads,
  withTitle,
  hiddenParameters,
  initialParameterValues = {},
}: SdkDashboardDisplayProps) => {
  // temporary name until we change `hideDownloadButton` to `downloads`
  const hideDownloadButton = !withDownloads;

  const displayOptions: EmbedDisplayParams = {
    ...DEFAULT_DASHBOARD_DISPLAY_OPTIONS,
    ...pick(
      {
        titled: withTitle,
        hideDownloadButton,
        hideParameters: hiddenParameters?.join(",") ?? null,
      },
      isNotNull,
    ),
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams: initialParameterValues,
  });
  const { isFullscreen, onFullscreenChange, ref } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({
      onRefresh: refreshDashboard,
    });

  return {
    displayOptions,
    isFullscreen,
    onFullscreenChange,
    ref,
    onRefreshPeriodChange,
    refreshPeriod,
    setRefreshElapsedHook,
  };
};
