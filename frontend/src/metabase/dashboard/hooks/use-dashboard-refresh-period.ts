import { useCallback, useRef, useState } from "react";
import { useUnmount } from "react-use";

import * as MetabaseAnalytics from "metabase/lib/analytics";

import type { DashboardRefreshPeriodControls } from "../types";

import { useInterval } from "./use-interval";

const TICK_PERIOD = 1; // seconds
export const useDashboardRefreshPeriod = ({
  onRefresh,
}: {
  onRefresh: () => void;
}): DashboardRefreshPeriodControls => {
  const [period, setPeriod] = useState<number | null>(null);
  const elapsedHook = useRef<((elapsed: number | null) => void) | null>(null);
  const elapsed = useRef<number | null>(0);

  const setRefreshElapsedHook = useCallback(
    (hook: (elapsed: number | null) => void) => {
      elapsedHook.current = hook;
    },
    [],
  );

  const intervalFactor = useCallback(() => {
    elapsed.current = (elapsed.current || 0) + TICK_PERIOD;
    if (period && elapsed.current && elapsed.current >= period) {
      elapsed.current = 0;
      onRefresh();
    }

    elapsedHook.current?.(elapsed.current);
  }, [onRefresh, period]);

  const { start, stop } = useInterval(intervalFactor, TICK_PERIOD * 1000);

  const onRefreshPeriodChange = useCallback(
    (newPeriod: number | null) => {
      stop();
      if (newPeriod !== null) {
        setPeriod(newPeriod);
        elapsedHook.current?.(0);
        start();
        MetabaseAnalytics.trackStructEvent("Dashboard", "Set Refresh", period);
      } else {
        elapsed.current = 0;
        setPeriod(null);
        elapsedHook.current?.(null);
      }
    },
    [period, start, stop],
  );

  useUnmount(() => {
    stop();
  });

  return {
    refreshPeriod: period,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
  };
};
