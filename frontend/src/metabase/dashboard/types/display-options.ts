import type { EmbedDisplayControls } from "metabase/dashboard/types/embed-display-options";

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

export type DashboardDisplayOptionControls = EmbedDisplayControls &
  DashboardFullscreenControls &
  DashboardRefreshPeriodControls;
