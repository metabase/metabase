import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { metricApi } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch } from "metabase/lib/redux";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { buildBinnedBreakoutDef } from "../utils/queries";

type BreakoutValuesMap = Map<MetricSourceId, MetricBreakoutValuesResponse>;

function getBreakoutCacheKey(
  entry: MetricsViewerDefinitionEntry,
): string | null {
  if (!entry.definition || !entry.breakoutDimension) {
    return null;
  }
  const rawDim = LibMetric.projectionDimension(
    entry.definition,
    entry.breakoutDimension,
  );
  if (!rawDim) {
    return null;
  }
  const dimId = LibMetric.dimensionValuesInfo(entry.definition, rawDim).id;

  const binning = LibMetric.binning(entry.breakoutDimension);
  const bucket = LibMetric.temporalBucket(entry.breakoutDimension);
  const binningKey = binning
    ? LibMetric.displayInfo(entry.definition, binning).displayName
    : "";
  const bucketKey = bucket
    ? LibMetric.displayInfo(entry.definition, bucket).shortName
    : "";

  return `${dimId}:${binningKey}:${bucketKey}`;
}

export function useBreakoutValues(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutValuesMap {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [results, setResults] = useState<BreakoutValuesMap>(new Map());
  const fetchedRef = useRef<Map<MetricSourceId, string>>(new Map());

  useEffect(() => {
    const entries = definitions.filter(
      (e) => e.definition != null && e.breakoutDimension != null,
    );

    if (entries.length === 0) {
      if (fetchedRef.current.size > 0) {
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
      const dimId = getBreakoutCacheKey(entry);
      if (!dimId) {
        continue;
      }

      const prevDimId = fetchedRef.current.get(entry.id);
      if (prevDimId === dimId) {
        continue;
      }

      fetchedRef.current.set(entry.id, dimId);

      const breakoutDef = buildBinnedBreakoutDef(
        entry.definition!,
        entry.breakoutDimension!,
      );
      const jsDefinition = LibMetric.toJsMetricDefinition(breakoutDef);

      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate({
          definition: jsDefinition,
        }),
      )
        .then((result) => {
          if (result.data) {
            setResults((prev) => {
              const next = new Map(prev);
              next.set(entry.id, result.data!);
              return next;
            });
          }
        })
        .catch(() => {
          sendToast({
            message: t`Something went wrong while loading breakout values`,
            toastColor: "error",
          });
        });
    }
  }, [definitions, dispatch, sendToast]);

  return results;
}
