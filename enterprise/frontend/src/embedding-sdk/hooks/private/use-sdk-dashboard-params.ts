import type { Query } from "history";
import type { CSSProperties } from "react";
import { pick } from "underscore";

import { DEFAULT_DASHBOARD_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { isNotNull } from "metabase/lib/types";
import type { DashboardId } from "metabase-types/api";

export type SdkDashboardDisplayProps = {
  dashboardId: DashboardId;
  initialParameters?: Query;
  withTitle?: boolean;
  withCardTitle?: boolean;
  withDownloads?: boolean;
  withFooter?: boolean;
  hiddenParameters?: string[];
  className?: string;
  style?: CSSProperties;
};

export const useSdkDashboardParams = ({
  dashboardId: initialDashboardId,
  withDownloads,
  withTitle,
  withFooter,
  hiddenParameters,
  initialParameters = {},
}: SdkDashboardDisplayProps) => {
  const { id: dashboardId, isLoading } = useValidatedEntityId({
    type: "dashboard",
    id: initialDashboardId,
  });

  // temporary name until we change `hideDownloadButton` to `downloads`
  const hideDownloadButton = !withDownloads;

  const displayOptions: EmbedDisplayParams = {
    ...DEFAULT_DASHBOARD_DISPLAY_OPTIONS,
    ...pick(
      {
        titled: withTitle,
        hideDownloadButton,
        hideParameters: hiddenParameters?.join(",") ?? null,
        withFooter,
      },
      isNotNull,
    ),
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams: initialParameters,
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
    dashboardId,
    isLoading,
  };
};
