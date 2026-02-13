import { useEffect, useRef, useState } from "react";

import { metricApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { applyProjection } from "../utils/queries";

type BreakoutValuesMap = Map<MetricSourceId, MetricBreakoutValuesResponse>;

function getBreakoutKey(
  entry: MetricsViewerDefinitionEntry,
): string | null {
  if (!entry.definition || !entry.breakoutDimension) {
    return null;
  }
  const info = LibMetric.displayInfo(entry.definition, entry.breakoutDimension);
  return info.name ? `${entry.id}:${info.name}` : null;
}

export function useBreakoutValues(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutValuesMap {
  const dispatch = useDispatch();
  const [results, setResults] = useState<BreakoutValuesMap>(new Map());
  const fetchedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const entries = definitions.filter(
      (e) => e.definition != null && e.breakoutDimension != null,
    );

    if (entries.length === 0) {
      if (results.size > 0) {
        setResults(new Map());
        fetchedKeysRef.current = new Set();
      }
      return;
    }

    const currentKeys = new Set(
      entries.map(getBreakoutKey).filter(Boolean) as string[],
    );

    for (const key of fetchedKeysRef.current) {
      if (!currentKeys.has(key)) {
        fetchedKeysRef.current.delete(key);
      }
    }

    for (const entry of entries) {
      const key = getBreakoutKey(entry);
      if (!key || fetchedKeysRef.current.has(key)) {
        continue;
      }

      fetchedKeysRef.current.add(key);

      const breakoutDef = applyProjection(
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
