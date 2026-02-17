import { useEffect, useRef, useState } from "react";

import { metricApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type { ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { buildBinnedBreakoutDef } from "../utils/queries";

type BreakoutValuesMap = Map<MetricSourceId, MetricBreakoutValuesResponse>;

interface FetchedEntry {
  breakoutDimension: ProjectionClause;
}

export function useBreakoutValues(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutValuesMap {
  const dispatch = useDispatch();
  const [results, setResults] = useState<BreakoutValuesMap>(new Map());
  const fetchedRef = useRef<Map<MetricSourceId, FetchedEntry>>(new Map());

  useEffect(() => {
    const entries = definitions.filter(
      (e) => e.definition != null && e.breakoutDimension != null,
    );

    if (entries.length === 0) {
      if (results.size > 0) {
        setResults(new Map());
        fetchedRef.current = new Map();
      }
      return;
    }

    const activeIds = new Set(entries.map((e) => e.id));
    for (const id of fetchedRef.current.keys()) {
      if (!activeIds.has(id)) {
        fetchedRef.current.delete(id);
      }
    }

    for (const entry of entries) {
      const prev = fetchedRef.current.get(entry.id);
      if (prev && prev.breakoutDimension === entry.breakoutDimension) {
        continue;
      }

      fetchedRef.current.set(entry.id, {
        breakoutDimension: entry.breakoutDimension!,
      });

      const breakoutDef = buildBinnedBreakoutDef(
        entry.definition!,
        entry.breakoutDimension!,
      );
      const jsDefinition = LibMetric.toJsMetricDefinition(breakoutDef);

      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate({
          definition: jsDefinition,
        }),
      ).then((result) => {
        if (result.data) {
          setResults((prev) => {
            const next = new Map(prev);
            next.set(entry.id, result.data!);
            return next;
          });
        }
      });
    }
  }, [definitions, dispatch, results.size]);

  return results;
}
