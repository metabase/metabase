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

export type DashboardNightModeControls = {
  hasNightModeToggle: boolean;
  onNightModeChange: (isNightMode: boolean) => void;
  isNightMode: boolean;
};

export type DashboardDownloadControls = {
  downloadsEnabled?: boolean;
};

export type DashboardFooterControls = {
  withFooter?: boolean;
};

export type DashboardLoaderWrapperProps = {
  noLoaderWrapper?: boolean;
};

export type DashboardDisplayOptionControls = DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardNightModeControls &
  DashboardDownloadControls &
  DashboardLoaderWrapperProps &
  DashboardFooterControls;
