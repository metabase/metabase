import { useCallback, useRef, useState } from "react";

import { useDispatch, useStore } from "metabase/lib/redux";
import type * as Lib from "metabase-lib";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";
import { t } from "ttag";

import {
  getQueryFromDefinition,
  loadMeasureDefinition,
  loadMetricDefinition,
} from "../adapters/definition-loader";
import type {
  DefinitionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  TempJsMetricDefinition,
} from "../types/viewer-state";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { computeDefaultTabs } from "../utils/tabs";

export interface DefinitionLoaderCallbacks {
  onAdd: (entry: MetricsViewerDefinitionEntry) => void;
  onRemove: (id: DefinitionId) => void;
  onUpdate: (id: DefinitionId, definition: TempJsMetricDefinition) => void;
  onReplace: (
    oldId: DefinitionId,
    newEntry: MetricsViewerDefinitionEntry,
  ) => void;
  onAddTab: (tab: MetricsViewerTabState) => void;
}

export interface UseDefinitionLoaderResult {
  loadingIds: Set<DefinitionId>;
  errorsByDefinitionId: Map<DefinitionId, string>;
  isLoading: (id: DefinitionId) => boolean;
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
  clearError: (id: DefinitionId) => void;
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
  const [errors, setErrors] = useState<Map<DefinitionId, string>>(new Map());
  const loadingRef = useRef<Set<DefinitionId>>(new Set());

  const isLoading = useCallback(
    (id: DefinitionId) => loadingIds.has(id),
    [loadingIds],
  );

  const clearError = useCallback((id: DefinitionId) => {
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const loadDefinition = useCallback(
    async (
      definitionId: DefinitionId,
      loader: () => Promise<TempJsMetricDefinition>,
      errorMsg: string,
    ): Promise<MetricsViewerDefinitionEntry | null> => {
      if (loadingRef.current.has(definitionId)) {
        return null;
      }

      loadingRef.current.add(definitionId);
      setLoadingIds((prev) => new Set(prev).add(definitionId));
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(definitionId);
        return next;
      });

      try {
        const definition = await loader();
        return { id: definitionId, definition };
      } catch (err) {
        const message = err instanceof Error ? err.message : errorMsg;
        setErrors((prev) => new Map(prev).set(definitionId, message));
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
      const queries: Record<MetricSourceId, Lib.Query | null> = {
        [entry.id]: getQueryFromDefinition(entry.definition),
      };
      for (const tab of computeDefaultTabs(queries, [entry.id])) {
        onAddTab(tab);
      }
    },
    [onAddTab],
  );

  const loadAndAdd = useCallback(
    async (
      definitionId: MetricSourceId,
      placeholderDefinition: TempJsMetricDefinition,
      loader: () => Promise<TempJsMetricDefinition>,
      errorMsg: string,
    ) => {
      onAdd({
        id: definitionId,
        definition: placeholderDefinition,
      });

      const entry = await loadDefinition(definitionId, loader, errorMsg);
      if (!entry) {
        onRemove(definitionId);
        return;
      }

      onUpdate(entry.id, entry.definition);

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
      placeholderDefinition: TempJsMetricDefinition,
      loader: () => Promise<TempJsMetricDefinition>,
      errorMsg: string,
    ) => {
      onReplace(oldSourceId, {
        id: newDefinitionId,
        definition: placeholderDefinition,
      });

      const entry = await loadDefinition(newDefinitionId, loader, errorMsg);
      if (!entry) {
        onRemove(newDefinitionId);
        return;
      }

      onUpdate(entry.id, entry.definition);
    },
    [onReplace, onRemove, onUpdate, loadDefinition],
  );

  const loadAndAddMetric = useCallback(
    (metricId: MetricId) =>
      loadAndAdd(
        createMetricSourceId(metricId),
        { "source-metric": metricId },
        () => loadMetricDefinition(dispatch, store.getState, metricId),
        t`Failed to load metric`,
      ),
    [dispatch, store, loadAndAdd],
  );

  const loadAndAddMeasure = useCallback(
    (measureId: MeasureId) =>
      loadAndAdd(
        createMeasureSourceId(measureId),
        { "source-measure": measureId },
        () => loadMeasureDefinition(dispatch, store.getState, measureId),
        t`Failed to load measure`,
      ),
    [dispatch, store, loadAndAdd],
  );

  const loadAndReplaceMetric = useCallback(
    (oldSourceId: MetricSourceId, metricId: MetricId) =>
      loadAndReplace(
        oldSourceId,
        createMetricSourceId(metricId),
        { "source-metric": metricId },
        () => loadMetricDefinition(dispatch, store.getState, metricId),
        t`Failed to load metric`,
      ),
    [dispatch, store, loadAndReplace],
  );

  const loadAndReplaceMeasure = useCallback(
    (oldSourceId: MetricSourceId, measureId: MeasureId) =>
      loadAndReplace(
        oldSourceId,
        createMeasureSourceId(measureId),
        { "source-measure": measureId },
        () => loadMeasureDefinition(dispatch, store.getState, measureId),
        t`Failed to load measure`,
      ),
    [dispatch, store, loadAndReplace],
  );

  return {
    loadingIds,
    errorsByDefinitionId: errors,
    isLoading,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
    clearError,
  };
}
