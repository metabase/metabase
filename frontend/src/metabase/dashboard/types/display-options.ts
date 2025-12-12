import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";

export type DashboardFullscreenControls = {
  isFullscreen: boolean;
  onFullscreenChange: (
    newIsFullscreen: boolean,
    browserFullscreen?: boolean,
  ) => void;
};

export type RefreshPeriod = number | null;

export type DashboardRefreshPeriodControls = {
  refreshPeriod: RefreshPeriod;
  onRefreshPeriodChange: (newPeriod: RefreshPeriod) => void;
  setRefreshElapsedHook: (
    hook: DashboardRefreshPeriodControls["onRefreshPeriodChange"],
  ) => void;
};

export type DashboardDownloadControls = {
  downloadsEnabled?: EmbedResourceDownloadOptions;
};

export type DashboardFooterControls = {
  withFooter?: boolean;
};

export type DashboardLoaderWrapperProps = {
  noLoaderWrapper?: boolean;
};

export type DashboardDisplayOptionControls = DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardDownloadControls &
  DashboardLoaderWrapperProps &
  DashboardFooterControls;
