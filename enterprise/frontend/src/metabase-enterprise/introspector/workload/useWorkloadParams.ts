import { useCallback, useMemo } from "react";
import { replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";

import type { WorkloadJobType, WorkloadRange } from "./types";

export type WorkloadFilters = {
  range: WorkloadRange;
  types: WorkloadJobType[];
  slot: string | null; // "2026-05-13T02" — the focused hour, or null
};

const DEFAULT_FILTERS: WorkloadFilters = {
  range: "forecast",
  types: [],
  slot: null,
};

export function useWorkloadParams() {
  const location = useSelector(getLocation);
  const dispatch = useDispatch();

  const params = useMemo(() => {
    const search = new URLSearchParams(location.search ?? "");
    return {
      range: (search.get("range") as WorkloadRange) ?? DEFAULT_FILTERS.range,
      types: (search.get("types")?.split(",").filter(Boolean) ??
        []) as WorkloadJobType[],
      slot: search.get("slot"),
    } satisfies WorkloadFilters;
  }, [location.search]);

  const setParams = useCallback(
    (next: Partial<WorkloadFilters>) => {
      const merged = { ...params, ...next };
      const search = new URLSearchParams();
      if (merged.range !== "forecast") {
        search.set("range", merged.range);
      }
      if (merged.types.length > 0) {
        search.set("types", merged.types.join(","));
      }
      if (merged.slot) {
        search.set("slot", merged.slot);
      }
      dispatch(
        replace({
          pathname: location.pathname,
          search: `?${search.toString()}`,
        }),
      );
    },
    [params, dispatch, location.pathname],
  );

  const range = useMemo(() => {
    // Align both boundaries to UTC midnight so we always show exactly 7 full calendar
    // days — otherwise a 168-hour rolling window crosses 8 calendar days with partials
    // on each end (white cells at the start of the first row and end of the last row).
    const now = new Date();
    const todayMidnightUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const DAY = 24 * 3600 * 1000;
    if (params.range === "forecast") {
      return {
        from: new Date(todayMidnightUTC).toISOString(),
        to: new Date(todayMidnightUTC + 7 * DAY).toISOString(),
      };
    }
    return {
      from: new Date(todayMidnightUTC - 7 * DAY).toISOString(),
      to: new Date(todayMidnightUTC).toISOString(),
    };
  }, [params.range]);

  const slotRange = useMemo(() => {
    if (!params.slot) {
      return null;
    }
    // slot format: "YYYY-MM-DDTHH:MM" (hourly grid uses minute=00). Range = that hour.
    const start = new Date(`${params.slot}:00Z`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [params.slot]);

  // Used by the slot table when no cell is focused — falls back to the full
  // week so the admin always sees what's scheduled, not just per-cell drill-down.
  const tableRange = useMemo(
    () => slotRange ?? { from: range.from, to: range.to },
    [slotRange, range.from, range.to],
  );

  return { params, setParams, range, slotRange, tableRange };
}
