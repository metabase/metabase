import type { MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";

import { useDispatch, useStore } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import {
  loadMeasureDefinition,
  loadMetricDefinition,
} from "../adapters/definition-loader";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerPageState,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { computeDefaultTabs } from "../utils/tabs";

interface StateCallbacks {
  addDefinition: (entry: MetricsViewerDefinitionEntry) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;
  removeDefinition: (id: MetricSourceId) => void;
  replaceDefinition: (
    oldId: MetricSourceId,
    newEntry: MetricsViewerDefinitionEntry,
  ) => void;
  addTab: (tab: MetricsViewerTabState) => void;
}

export interface UseDefinitionLoaderResult {
  loadingIds: Set<MetricSourceId>;
  loadAndAddMetric: (metricId: MetricId) => void;
  loadAndAddMeasure: (measureId: MeasureId) => void;
  loadAndReplaceMetric: (
    oldSourceId: MetricSourceId,
    metricId: MetricId,
  ) => void;
  loadAndReplaceMeasure: (
    oldSourceId: MetricSourceId,
    measureId: MeasureId,
  ) => void;
}

export function useDefinitionLoader(
  latestState: MutableRefObject<MetricsViewerPageState>,
  callbacks: StateCallbacks,
): UseDefinitionLoaderResult {
  const dispatch = useDispatch();
  const store = useStore();

  const loadingRef = useRef<Set<MetricSourceId>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<MetricSourceId>>(new Set());

  const loadDefinition = useCallback(
    async (id: MetricSourceId, loader: () => Promise<MetricDefinition>) => {
      if (loadingRef.current.has(id)) {
        return;
      }

      loadingRef.current.add(id);
      setLoadingIds((prev) => new Set(prev).add(id));
      callbacks.addDefinition({ id, definition: null });

      try {
        const definition = await loader();
        callbacks.updateDefinition(id, definition);

        if (latestState.current.tabs.length === 0) {
          const definitions: Record<MetricSourceId, MetricDefinition | null> = {
            [id]: definition,
          };
          const tabs = computeDefaultTabs(definitions, [id]);
          for (const tab of tabs) {
            callbacks.addTab(tab);
          }
        }
      } catch {
        callbacks.removeDefinition(id);
      } finally {
        loadingRef.current.delete(id);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [callbacks, latestState],
  );

  const loadAndReplace = useCallback(
    async (
      oldSourceId: MetricSourceId,
      newId: MetricSourceId,
      loader: () => Promise<MetricDefinition>,
    ) => {
      if (loadingRef.current.has(newId)) {
        return;
      }

      loadingRef.current.add(newId);
      setLoadingIds((prev) => new Set(prev).add(newId));
      callbacks.replaceDefinition(oldSourceId, {
        id: newId,
        definition: null,
      });

      try {
        const definition = await loader();
        callbacks.updateDefinition(newId, definition);
      } catch {
        callbacks.removeDefinition(newId);
      } finally {
        loadingRef.current.delete(newId);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(newId);
          return next;
        });
      }
    },
    [callbacks],
  );

  const loadAndAddMetric = useCallback(
    (metricId: MetricId) =>
      loadDefinition(createMetricSourceId(metricId), () =>
        loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [loadDefinition, dispatch, store],
  );

  const loadAndAddMeasure = useCallback(
    (measureId: MeasureId) =>
      loadDefinition(createMeasureSourceId(measureId), () =>
        loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [loadDefinition, dispatch, store],
  );

  const loadAndReplaceMetric = useCallback(
    (oldSourceId: MetricSourceId, metricId: MetricId) =>
      loadAndReplace(oldSourceId, createMetricSourceId(metricId), () =>
        loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [loadAndReplace, dispatch, store],
  );

  const loadAndReplaceMeasure = useCallback(
    (oldSourceId: MetricSourceId, measureId: MeasureId) =>
      loadAndReplace(oldSourceId, createMeasureSourceId(measureId), () =>
        loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [loadAndReplace, dispatch, store],
  );

  return {
    loadingIds,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  };
}
