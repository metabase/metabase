import type { Location } from "history";
import type { LocationAction } from "react-router-redux";

import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";
import type { DashboardId } from "metabase-types/api";

import type { FetchDashboardResult } from "../types";

// passed via ...this.props
export type DashboardControlsProps = {
  location: Location;
  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams?: Record<string, unknown>;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<FetchDashboardResult>;
  dashboardId: DashboardId;
  fetchDashboardCardData: (opts?: {
    reload?: boolean;
    clearCache?: boolean;
  }) => Promise<void>;
};

// Passed via ...this.state
export type DashboardControlsState = {
  isFullscreen: boolean;
  refreshPeriod: number | null;
  theme: EmbeddingDisplayOptions["theme"];
  hideParameters: string;
};

export type DashboardControlsPassedProps = {
  // Passed via explicit props
  replace: LocationAction;
  isNightMode: boolean;
  hasNightModeToggle: boolean;
  setRefreshElapsedHook: (hook: (elapsed: number) => void) => void;
  loadDashboardParams: () => void;
  onNightModeChange: (isNightMode: boolean) => void;
  onFullscreenChange: (isFullscreen: boolean) => void;
  onRefreshPeriodChange: (refreshPeriod: number | null) => void;
} & DashboardControlsProps &
  DashboardControlsState;
