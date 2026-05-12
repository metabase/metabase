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
    const now = new Date();
    if (params.range === "forecast") {
      return {
        from: now.toISOString(),
        to: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
      };
    }
    return {
      from: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
      to: now.toISOString(),
    };
  }, [params.range]);

  const slotRange = useMemo(() => {
    if (!params.slot) {
      return null;
    }
    const start = new Date(`${params.slot}:00:00Z`);
    const end = new Date(start.getTime() + 3600 * 1000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [params.slot]);

  return { params, setParams, range, slotRange };
}
