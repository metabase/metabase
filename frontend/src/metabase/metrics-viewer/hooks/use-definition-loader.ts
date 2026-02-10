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
  DefinitionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { computeDefaultTabs } from "../utils/tabs";

export interface DefinitionLoaderCallbacks {
  onAdd: (entry: MetricsViewerDefinitionEntry) => void;
  onRemove: (id: DefinitionId) => void;
  onUpdate: (id: DefinitionId, definition: MetricDefinition) => void;
  onReplace: (
    oldId: DefinitionId,
    newEntry: MetricsViewerDefinitionEntry,
  ) => void;
  onAddTab: (tab: MetricsViewerTabState) => void;
}

export interface UseDefinitionLoaderResult {
  loadingIds: Set<DefinitionId>;
  loadAndAddMetric: (metricId: MetricId) => Promise<void>;
  loadAndAddMeasure: (measureId: MeasureId) => Promise<void>;
  loadAndReplaceMetric: (
    oldSourceId: MetricSourceId,
    metricId: MetricId,
  ) => Promise<void>;
  loadAndReplaceMeasure: (
    oldSourceId: MetricSourceId,
    measureId: MeasureId,
  ) => Promise<void>;
}

export function useDefinitionLoader(
  currentDefinitions: MetricsViewerDefinitionEntry[],
  {
    onAdd,
    onRemove,
    onUpdate,
    onReplace,
    onAddTab,
  }: DefinitionLoaderCallbacks,
): UseDefinitionLoaderResult {
  const dispatch = useDispatch();
  const store = useStore();

  const [loadingIds, setLoadingIds] = useState<Set<DefinitionId>>(new Set());
  const loadingRef = useRef<Set<DefinitionId>>(new Set());

  const loadDefinition = useCallback(
    async (
      definitionId: DefinitionId,
      loader: () => Promise<MetricDefinition>,
    ): Promise<MetricsViewerDefinitionEntry | null> => {
      if (loadingRef.current.has(definitionId)) {
        return null;
      }

      loadingRef.current.add(definitionId);
      setLoadingIds((prev) => new Set(prev).add(definitionId));

      try {
        const definition = await loader();
        return { id: definitionId, definition };
      } catch {
        return null;
      } finally {
        loadingRef.current.delete(definitionId);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(definitionId);
          return next;
        });
      }
    },
    [],
  );

  const createDefaultTabs = useCallback(
    (entry: MetricsViewerDefinitionEntry) => {
      if (!entry.definition) {
        return;
      }
      const definitions: Record<MetricSourceId, MetricDefinition | null> = {
        [entry.id]: entry.definition,
      };
      for (const tab of computeDefaultTabs(definitions, [entry.id])) {
        onAddTab(tab);
      }
    },
    [onAddTab],
  );

  const loadAndAdd = useCallback(
    async (
      definitionId: MetricSourceId,
      loader: () => Promise<MetricDefinition>,
    ) => {
      onAdd({
        id: definitionId,
        definition: null,
      });

      const entry = await loadDefinition(definitionId, loader);
      if (!entry) {
        onRemove(definitionId);
        return;
      }

      onUpdate(entry.id, entry.definition!);

      if (currentDefinitions.length === 0) {
        createDefaultTabs(entry);
      }
    },
    [onAdd, onRemove, onUpdate, currentDefinitions.length, loadDefinition, createDefaultTabs],
  );

  const loadAndReplace = useCallback(
    async (
      oldSourceId: MetricSourceId,
      newDefinitionId: MetricSourceId,
      loader: () => Promise<MetricDefinition>,
    ) => {
      onReplace(oldSourceId, {
        id: newDefinitionId,
        definition: null,
      });

      const entry = await loadDefinition(newDefinitionId, loader);
      if (!entry) {
        onRemove(newDefinitionId);
        return;
      }

      onUpdate(entry.id, entry.definition!);
    },
    [onReplace, onRemove, onUpdate, loadDefinition],
  );

  const loadAndAddMetric = useCallback(
    (metricId: MetricId) =>
      loadAndAdd(
        createMetricSourceId(metricId),
        () => loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [dispatch, store, loadAndAdd],
  );

  const loadAndAddMeasure = useCallback(
    (measureId: MeasureId) =>
      loadAndAdd(
        createMeasureSourceId(measureId),
        () => loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [dispatch, store, loadAndAdd],
  );

  const loadAndReplaceMetric = useCallback(
    (oldSourceId: MetricSourceId, metricId: MetricId) =>
      loadAndReplace(
        oldSourceId,
        createMetricSourceId(metricId),
        () => loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [dispatch, store, loadAndReplace],
  );

  const loadAndReplaceMeasure = useCallback(
    (oldSourceId: MetricSourceId, measureId: MeasureId) =>
      loadAndReplace(
        oldSourceId,
        createMeasureSourceId(measureId),
        () => loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [dispatch, store, loadAndReplace],
  );

  return {
    loadingIds,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  };
}
