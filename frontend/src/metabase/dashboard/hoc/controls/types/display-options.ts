import type { EmbedDisplayControls } from "metabase/dashboard/hoc/controls/types/embed-display-options";

export type DashboardFullscreenControls = {
  isFullscreen: boolean | null;
  onFullscreenChange: (
    newIsFullscreen: boolean | null,
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
