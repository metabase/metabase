import type { MutableRefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { MetricDefinition } from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";
import { getDefinitionName } from "../../../utils/definition-builder";
import { createSourceId } from "../../../utils/source-ids";
import type { MetricNameMap } from "../utils";

type UseMetricNameTrackingParams = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
};

type UseMetricNameTrackingResult = {
  metricNames: MetricNameMap;
  metricNamesRef: MutableRefObject<MetricNameMap>;
  handleAddMetric: (metric: SelectedMetric) => void;
  handleRemoveMetric: (
    metricId: number,
    sourceType: "metric" | "measure",
  ) => void;
  handleSwapMetric: (
    oldMetric: SelectedMetric,
    newMetric: SelectedMetric,
  ) => void;
};

export function useMetricNameTracking({
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
}: UseMetricNameTrackingParams): UseMetricNameTrackingResult {
  const [localMetricNames, setLocalMetricNames] = useState<MetricNameMap>({});

  const metricNames: MetricNameMap = useMemo(
    () => ({
      ...localMetricNames,
      ...Object.fromEntries(
        Object.values(definitions)
          .filter(
            (e): e is { id: MetricSourceId; definition: MetricDefinition } =>
              e.definition !== null,
          )
          .map((e) => [e.id, getDefinitionName(e.definition)])
          .filter(([, name]) => name !== null),
      ),
    }),
    [localMetricNames, definitions],
  );

  const metricNamesRef = useRef<MetricNameMap>(metricNames);
  metricNamesRef.current = metricNames;

  const handleAddMetric = useCallback(
    (metric: SelectedMetric) => {
      onAddMetric(metric);
      if (metric.name != null) {
        setLocalMetricNames((prev) => ({
          ...prev,
          [createSourceId(metric.id, metric.sourceType)]: metric.name!,
        }));
      }
    },
    [onAddMetric],
  );

  const handleRemoveMetric = useCallback(
    (metricId: number, sourceType: "metric" | "measure") => {
      onRemoveMetric(metricId, sourceType);
      const sourceId = createSourceId(metricId, sourceType);
      setLocalMetricNames((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
    },
    [onRemoveMetric],
  );

  const handleSwapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      onSwapMetric(oldMetric, newMetric);
      setLocalMetricNames((prev) => {
        const next = { ...prev };
        delete next[createSourceId(oldMetric.id, oldMetric.sourceType)];
        if (newMetric.name != null) {
          next[createSourceId(newMetric.id, newMetric.sourceType)] =
            newMetric.name;
        }
        return next;
      });
    },
    [onSwapMetric],
  );

  return {
    metricNames,
    metricNamesRef,
    handleAddMetric,
    handleRemoveMetric,
    handleSwapMetric,
  };
}
