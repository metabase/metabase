import type { DisplayTheme } from "metabase/public/lib/types";

export type DashboardBorderControls = {
  bordered: boolean;
  setBordered: (bordered: boolean) => void;
};

export type DashboardTitledControls = {
  titled: boolean;
  setTitled: (titled: boolean) => void;
};

export type DashboardHideDownloadButtonControls = {
  hideDownloadButton: boolean;
  setHideDownloadButton: (hideDownloadButton: boolean) => void;
};

export type DashboardHideParametersControls = {
  hideParameters: string | null;
  setHideParameters: (hideParameters: string | null) => void;
};

export type DashboardFullscreenControls = {
  isFullscreen: boolean;
  onFullscreenChange: (
    newIsFullscreen: boolean,
    browserFullscreen?: boolean,
  ) => Promise<void>;
};

export type RefreshPeriod = number | null;

export type DashboardRefreshPeriodControls = {
  refreshPeriod: RefreshPeriod;
  onRefreshPeriodChange: (newPeriod: RefreshPeriod) => void;
  setRefreshElapsedHook: (
    hook: DashboardRefreshPeriodControls["onRefreshPeriodChange"],
  ) => void;
};

export type DashboardThemeControls = {
  theme: DisplayTheme | null;
  setTheme: (theme: DisplayTheme | null) => void;
  hasNightModeToggle: boolean;
  onNightModeChange: (isNightMode: boolean) => void;
  isNightMode: boolean;
};

export type DashboardDisplayOptionControls = DashboardFullscreenControls &
  DashboardThemeControls &
  DashboardRefreshPeriodControls &
  DashboardBorderControls &
  DashboardTitledControls &
  DashboardHideDownloadButtonControls &
  DashboardHideParametersControls;
