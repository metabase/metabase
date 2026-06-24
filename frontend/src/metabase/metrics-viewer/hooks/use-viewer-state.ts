import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { measureApi, metricApi, segmentApi } from "metabase/api";
import { useDispatch, useStore } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getObjectEntries } from "metabase/utils/objects";
import type { MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type { MetricsViewerPageProps } from "../pages/MetricsViewerPage/MetricsViewerPage";
import type {
  DimensionBreakoutInfo,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  SelectedMetric,
  UseViewerStateResult,
} from "../types";
import {
  getInitialMetricsViewerPageState,
  isExpressionEntry,
  isMetricEntry,
} from "../types";
import {
  applySerializedDefinitionInfo,
  areDimensionBreakoutDimensionsValid,
  assignDimensionsForUnmappedSlots,
  buildBinnedBreakoutDefinition,
  computeDefaultDimensionBreakouts,
  createDimensionBreakoutFromInfo,
  createMeasureSourceId,
  createMetricSourceId,
  createSourceId,
  getEffectiveDefinitionEntry,
  getValidSelectedDimensionBreakoutId,
} from "../utils";
import { computeMetricSlots } from "../utils/metric-slots";
import { remapDimensionMappings } from "../utils/remap-dimension-mappings";

import { useViewerDerivedData } from "./use-viewer-derived-data";
import { type LoadSourcesRequest, useViewerUrl } from "./use-viewer-url";

async function loadMetricDefinition(
  dispatch: ReturnType<typeof useDispatch>,
  getState: ReturnType<typeof useStore>["getState"],
  metricId: MetricId,
): Promise<MetricDefinition> {
  const [result] = await Promise.all([
    dispatch(metricApi.endpoints.getMetric.initiate(metricId)),
    dispatch(segmentApi.endpoints.listSegments.initiate()), // Ensure segments are present in Redux before building the metadata provider
  ]);
  if (!result.data) {
    throw new Error(`Failed to load metric ${metricId}`);
  }
  const provider = LibMetric.metadataProvider(getMetadata(getState()));
  const meta = LibMetric.metricMetadata(provider, metricId);
  if (!meta) {
    throw new Error(`Metric ${metricId} not found in metadata`);
  }
  return LibMetric.fromMetricMetadata(provider, meta);
}

async function loadMeasureDefinition(
  dispatch: ReturnType<typeof useDispatch>,
  getState: ReturnType<typeof useStore>["getState"],
  measureId: MeasureId,
): Promise<MetricDefinition> {
  const [result] = await Promise.all([
    dispatch(measureApi.endpoints.getMeasure.initiate(measureId)),
    dispatch(segmentApi.endpoints.listSegments.initiate()), // Ensure segments are present in Redux before building the metadata provider
  ]);
  if (!result.data) {
    throw new Error(`Failed to load measure ${measureId}`);
  }
  const provider = LibMetric.metadataProvider(getMetadata(getState()));
  const meta = LibMetric.measureMetadata(provider, measureId);
  if (!meta) {
    throw new Error(`Measure ${measureId} not found in metadata`);
  }
  return LibMetric.fromMeasureMetadata(provider, meta);
}

export function useViewerState({
  location,
}: MetricsViewerPageProps): UseViewerStateResult {
  const dispatch = useDispatch();
  const store = useStore();

  const [state, setState] = useState<MetricsViewerPageState>(
    getInitialMetricsViewerPageState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadingRef = useRef<Set<MetricSourceId>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<MetricSourceId>>(new Set());

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [isSidebarOpen, { open: openSidebar, close: closeSidebar }] =
    useDisclosure(false);

  const initialize: (newState: MetricsViewerPageState) => void = setState;

  const addDefinition = useCallback(
    (entry: MetricsViewerDefinitionEntry) =>
      setState((prev) => {
        if (entry.id in prev.definitions) {
          return prev;
        }

        return {
          ...prev,
          definitions: {
            ...prev.definitions,
            [entry.id]: entry,
          },
        };
      }),
    [],
  );

  const removeDefinition = useCallback(
    (id: MetricSourceId) =>
      setState((prev) => {
        const { [id]: _, ...newDefinitions } = prev.definitions;

        // Find slot indices being removed (slots for this sourceId)
        const slots = computeMetricSlots(prev.formulaEntities);
        const removedSlotIndices = new Set(
          slots.filter((s) => s.sourceId === id).map((s) => s.slotIndex),
        );

        const newDimensionBreakouts =
          // scalar dimension breakout is always valid, but we want to remove it if there are no definitions
          // so that adding a new definition triggers computeDefaultDimensionBreakouts
          Object.keys(newDefinitions).length === 0
            ? []
            : prev.dimensionBreakouts
                .map((dimensionBreakout) => {
                  // Remove entries for removed slot indices.
                  // Don't shift — remapDimensionMappings handles that
                  // when formulaEntities are updated separately.
                  const newMapping: Record<number, string | null> = {};
                  for (const [key, value] of getObjectEntries(
                    dimensionBreakout.dimensionMapping,
                  )) {
                    const idx = Number(key);
                    if (!removedSlotIndices.has(idx)) {
                      newMapping[idx] = value;
                    }
                  }
                  return { ...dimensionBreakout, dimensionMapping: newMapping };
                })
                .filter((dimensionBreakout) =>
                  areDimensionBreakoutDimensionsValid(dimensionBreakout),
                );

        return {
          ...prev,
          definitions: newDefinitions,
          dimensionBreakouts: newDimensionBreakouts,
          selectedDimensionBreakoutId: getValidSelectedDimensionBreakoutId(
            prev.selectedDimensionBreakoutId,
            newDimensionBreakouts,
          ),
        };
      }),
    [],
  );

  const updateDefinition = useCallback(
    (id: MetricSourceId, definition: MetricDefinition) =>
      setState((prev) => {
        const existing = prev.definitions[id];
        if (!existing) {
          return prev;
        }

        const newDefinitions = {
          ...prev.definitions,
          [id]: { ...existing, definition },
        };

        if (prev.dimensionBreakouts.length === 0) {
          return { ...prev, definitions: newDefinitions };
        }

        const updatedDimensionBreakouts = assignDimensionsForUnmappedSlots(
          prev.dimensionBreakouts,
          newDefinitions,
          prev.formulaEntities,
        );

        const newDimensionBreakouts = updatedDimensionBreakouts.filter(
          (dimensionBreakout) =>
            areDimensionBreakoutDimensionsValid(dimensionBreakout),
        );

        return {
          ...prev,
          definitions: newDefinitions,
          dimensionBreakouts: newDimensionBreakouts,
          selectedDimensionBreakoutId: getValidSelectedDimensionBreakoutId(
            prev.selectedDimensionBreakoutId,
            newDimensionBreakouts,
          ),
        };
      }),
    [],
  );

  const replaceDefinition = useCallback(
    (oldId: MetricSourceId, newEntry: MetricsViewerDefinitionEntry) =>
      setState((prev) => {
        if (!(oldId in prev.definitions)) {
          return prev;
        }

        // Check if any expression token still references the old sourceId.
        // If so, keep the old definition so the expression remains valid.
        const expressionStillReferencesOld = prev.formulaEntities.some(
          (fe) =>
            fe.type === "expression" &&
            fe.tokens.some((t) => t.type === "metric" && t.sourceId === oldId),
        );

        const { [oldId]: _oldDef, ...rest } = prev.definitions;
        const newDefinitions = expressionStillReferencesOld
          ? { ...prev.definitions, [newEntry.id]: newEntry }
          : { ...rest, [newEntry.id]: newEntry };

        // Update formulaEntities: replace standalone metric refs with the new one
        // (expression tokens keep referencing the old sourceId)
        const newFormulaEntities = prev.formulaEntities.map((fe) => {
          if (fe.type === "metric" && fe.id === oldId) {
            return { ...newEntry, type: "metric" as const };
          }
          return fe;
        });

        // Find slot indices that were replaced
        const slots = computeMetricSlots(prev.formulaEntities);
        const replacedSlotIndices = new Set(
          slots.filter((s) => s.sourceId === oldId).map((s) => s.slotIndex),
        );

        // Remove dimension mappings for replaced slot indices (new metric has different dimensions)
        const newDimensionBreakouts = prev.dimensionBreakouts.map(
          (dimensionBreakout) => {
            const newMapping = { ...dimensionBreakout.dimensionMapping };
            for (const idx of replacedSlotIndices) {
              delete newMapping[idx];
            }
            return { ...dimensionBreakout, dimensionMapping: newMapping };
          },
        );

        return {
          ...prev,
          definitions: newDefinitions,
          formulaEntities: newFormulaEntities,
          dimensionBreakouts: newDimensionBreakouts,
        };
      }),
    [],
  );

  const selectDimensionBreakoutById = useCallback(
    (dimensionBreakoutId: string) =>
      setState((prev) => ({
        ...prev,
        selectedDimensionBreakoutId: dimensionBreakoutId,
      })),
    [],
  );

  const addDimensionBreakout = useCallback(
    (dimensionBreakout: MetricsViewerDimensionBreakoutState) =>
      setState((prev) => {
        if (
          prev.dimensionBreakouts.some(
            (existing) => existing.id === dimensionBreakout.id,
          )
        ) {
          return prev;
        }
        const newDimensionBreakouts = assignDimensionsForUnmappedSlots(
          [...prev.dimensionBreakouts, dimensionBreakout],
          prev.definitions,
          prev.formulaEntities,
        );
        return {
          ...prev,
          dimensionBreakouts: newDimensionBreakouts,
          selectedDimensionBreakoutId:
            prev.selectedDimensionBreakoutId == null
              ? dimensionBreakout.id
              : prev.selectedDimensionBreakoutId,
        };
      }),
    [],
  );

  const updateDimensionBreakout = useCallback(
    (
      dimensionBreakoutId: string,
      updates: Partial<MetricsViewerDimensionBreakoutState>,
    ) =>
      setState((prev) => ({
        ...prev,
        dimensionBreakouts: prev.dimensionBreakouts.map((dimensionBreakout) =>
          dimensionBreakout.id === dimensionBreakoutId
            ? { ...dimensionBreakout, ...updates }
            : dimensionBreakout,
        ),
      })),
    [],
  );

  const setFormulaEntities = useCallback(
    (
      formulaEntities: MetricsViewerFormulaEntity[],
      slotMapping?: Map<number, number>,
    ) =>
      setState((prev) => {
        // When a slotMapping is provided (from commitAndCollapse or
        // handleRemoveItem), use it to remap dimension mappings efficiently.
        // Otherwise the caller is not changing entity structure (paren cleanup,
        // filter/breakout changes, URL restore) so dimensionBreakouts are kept as-is.
        const reconciledDimensionBreakouts = slotMapping
          ? remapDimensionMappings(
              prev.dimensionBreakouts,
              slotMapping,
              formulaEntities,
            )
          : prev.dimensionBreakouts;
        let dimensionBreakouts = assignDimensionsForUnmappedSlots(
          reconciledDimensionBreakouts,
          prev.definitions,
          formulaEntities,
        );

        // When dimensionBreakouts are empty (e.g. all metrics were removed then one was
        // added back), generate default dimensionBreakouts now that formulaEntities includes
        // the new metric and its definition may already be loaded.
        if (dimensionBreakouts.length === 0) {
          const metricSlots = computeMetricSlots(formulaEntities);
          if (metricSlots.length > 0) {
            const definitionsBySourceId: Record<
              MetricSourceId,
              MetricDefinition | null
            > = {};
            for (const [id, entry] of Object.entries(prev.definitions)) {
              definitionsBySourceId[id as MetricSourceId] =
                entry.definition ?? null;
            }
            dimensionBreakouts = computeDefaultDimensionBreakouts(
              definitionsBySourceId,
              metricSlots,
            );
          }
        }

        let selectedDimensionBreakoutId = prev.selectedDimensionBreakoutId;
        if (selectedDimensionBreakoutId == null) {
          selectedDimensionBreakoutId = dimensionBreakouts[0]?.id ?? null;
        }

        return {
          ...prev,
          formulaEntities,
          dimensionBreakouts,
          selectedDimensionBreakoutId,
        };
      }),
    [],
  );

  const setBreakoutDimension = useCallback(
    (entity: MetricDefinitionEntry, dimension: ProjectionClause | undefined) =>
      setState((prev) => {
        const defEntry = getEffectiveDefinitionEntry(entity, prev.definitions);
        if (!defEntry?.definition) {
          return prev;
        }

        const entityIndex = prev.formulaEntities.indexOf(entity);
        if (entityIndex === -1) {
          return prev;
        }

        let newDefinition: MetricDefinition | null = null;

        if (dimension) {
          let baseDef = defEntry.definition;
          const existingProjections = LibMetric.projections(baseDef);
          for (const proj of existingProjections) {
            baseDef = LibMetric.removeClause(baseDef, proj);
          }
          newDefinition = buildBinnedBreakoutDefinition(baseDef, dimension);
        }

        const newEntities = [...prev.formulaEntities];
        newEntities[entityIndex] = {
          ...entity,
          definition: newDefinition,
        };

        return {
          ...prev,
          formulaEntities: newEntities,
        };
      }),
    [],
  );

  const clearLoading = useCallback((id: MetricSourceId) => {
    loadingRef.current.delete(id);
    if (loadingRef.current.size === 0) {
      setInitialLoadComplete(true);
    }
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const loadDefinition = useCallback(
    async (
      id: MetricSourceId,
      loader: () => Promise<MetricDefinition>,
      transform?: (def: MetricDefinition) => MetricDefinition,
    ) => {
      if (loadingRef.current.has(id)) {
        return;
      }

      loadingRef.current.add(id);
      setLoadingIds((prev) => new Set(prev).add(id));
      addDefinition({ id, definition: null });

      try {
        const rawDefinition = await loader();
        // for some reason, React may run updateDefinition's state update before addDefinition's
        // it then corrects itself and runs them in the correct order
        // but the temporarily incorrect ordering breaks our handling of the browser's forward/back buttons
        // so wrap updateDefinition in a setTimeout to ensure it runs after addDefinition
        setTimeout(() => {
          try {
            const definition = transform
              ? transform(rawDefinition)
              : rawDefinition;
            updateDefinition(id, definition);

            if (stateRef.current.dimensionBreakouts.length === 0) {
              const definitions: Record<
                MetricSourceId,
                MetricDefinition | null
              > = {
                [id]: definition,
              };
              const metricSlots = computeMetricSlots(
                stateRef.current.formulaEntities,
              );
              const dimensionBreakouts = computeDefaultDimensionBreakouts(
                definitions,
                metricSlots,
              );
              for (const dimensionBreakout of dimensionBreakouts) {
                addDimensionBreakout(dimensionBreakout);
              }
            }
          } finally {
            clearLoading(id);
          }
        }, 0);
      } catch {
        removeDefinition(id);
        clearLoading(id);
      }
    },
    [
      addDefinition,
      updateDefinition,
      removeDefinition,
      addDimensionBreakout,
      clearLoading,
    ],
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
      replaceDefinition(oldSourceId, {
        id: newId,
        definition: null,
      });

      try {
        const definition = await loader();
        // see comment above setTimeout in loadDefinition
        setTimeout(() => {
          try {
            updateDefinition(newId, definition);
          } finally {
            clearLoading(newId);
          }
        }, 0);
      } catch {
        removeDefinition(newId);
        clearLoading(newId);
      }
    },
    [replaceDefinition, updateDefinition, removeDefinition, clearLoading],
  );

  const loadAndAddMetric = useCallback(
    (
      metricId: MetricId,
      transform?: (def: MetricDefinition) => MetricDefinition,
    ) =>
      loadDefinition(
        createMetricSourceId(metricId),
        () => loadMetricDefinition(dispatch, store.getState, metricId),
        transform,
      ),
    [loadDefinition, dispatch, store],
  );

  const loadAndAddMeasure = useCallback(
    (
      measureId: MeasureId,
      transform?: (def: MetricDefinition) => MetricDefinition,
    ) =>
      loadDefinition(
        createMeasureSourceId(measureId),
        () => loadMeasureDefinition(dispatch, store.getState, measureId),
        transform,
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

  // as definitions load, apply SerializedDefinitionInfo to formulaEntities
  useEffect(() => {
    let changed = false;
    const updatedEntities = state.formulaEntities.map((entity) => {
      if (
        isMetricEntry(entity) &&
        entity.serializedDefinitionInfo &&
        !entity.definition
      ) {
        const baseDef = state.definitions[entity.id]?.definition;
        if (baseDef) {
          changed = true;
          return {
            ...entity,
            definition: applySerializedDefinitionInfo(
              baseDef,
              entity.serializedDefinitionInfo,
            ),
            serializedDefinitionInfo: undefined,
          };
        }
      }
      if (isExpressionEntry(entity)) {
        let tokenChanged = false;
        const updatedTokens = entity.tokens.map((token) => {
          if (
            token.type === "metric" &&
            token.serializedDefinitionInfo &&
            !token.definition
          ) {
            const baseDef = state.definitions[token.sourceId]?.definition;
            if (baseDef) {
              tokenChanged = true;
              changed = true;
              return {
                ...token,
                definition: applySerializedDefinitionInfo(
                  baseDef,
                  token.serializedDefinitionInfo,
                ),
                serializedDefinitionInfo: undefined,
              };
            }
          }
          return token;
        });
        return tokenChanged ? { ...entity, tokens: updatedTokens } : entity;
      }
      return entity;
    });
    if (changed) {
      setFormulaEntities(updatedEntities);
    }
  }, [state.definitions, state.formulaEntities, setFormulaEntities]);

  const handleLoadSources = useCallback(
    (request: LoadSourcesRequest) => {
      for (const metricId of request.metricIds) {
        loadAndAddMetric(metricId);
      }
      for (const measureId of request.measureIds) {
        loadAndAddMeasure(measureId);
      }
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(
    state,
    initialize,
    handleLoadSources,
    location,
    setFormulaEntities,
    setInitialLoadComplete,
  );

  const derivedData = useViewerDerivedData({
    definitions: state.definitions,
    formulaEntities: state.formulaEntities,
    dimensionBreakouts: state.dimensionBreakouts,
    selectedDimensionBreakoutId: state.selectedDimensionBreakoutId,
    loadingIds,
  });

  const addMetric = useCallback(
    (metric: SelectedMetric) => {
      const sourceId = createSourceId(metric.id, metric.sourceType);

      if (sourceId in state.definitions) {
        return;
      }

      if (metric.sourceType === "metric") {
        loadAndAddMetric(metric.id);
      } else {
        loadAndAddMeasure(metric.id);
      }
    },
    [state.definitions, loadAndAddMetric, loadAndAddMeasure],
  );

  const swapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      const oldSourceId = createSourceId(oldMetric.id, oldMetric.sourceType);

      if (newMetric.sourceType === "metric") {
        loadAndReplaceMetric(oldSourceId, newMetric.id);
      } else {
        loadAndReplaceMeasure(oldSourceId, newMetric.id);
      }
    },
    [loadAndReplaceMetric, loadAndReplaceMeasure],
  );

  const removeMetric = useCallback(
    (id: number, sourceType: "metric" | "measure") => {
      removeDefinition(createSourceId(id, sourceType));
    },
    [removeDefinition],
  );

  const selectDimensionBreakout = useCallback(
    (
      dimensionBreakoutInfo: DimensionBreakoutInfo,
      options?: { updateExisting?: boolean },
    ) => {
      const newDimensionBreakout = createDimensionBreakoutFromInfo(
        dimensionBreakoutInfo,
      );
      if (!newDimensionBreakout) {
        return;
      }

      if (options?.updateExisting) {
        setState((prev) => {
          const existingDimensionBreakout = prev.dimensionBreakouts.find(
            (dimensionBreakout) =>
              dimensionBreakout.id === newDimensionBreakout.id,
          );
          const dimensionBreakouts = existingDimensionBreakout
            ? prev.dimensionBreakouts.map((dimensionBreakout) =>
                dimensionBreakout.id === newDimensionBreakout.id
                  ? {
                      ...dimensionBreakout,
                      label: newDimensionBreakout.label,
                      dimensionMapping: newDimensionBreakout.dimensionMapping,
                    }
                  : dimensionBreakout,
              )
            : assignDimensionsForUnmappedSlots(
                [...prev.dimensionBreakouts, newDimensionBreakout],
                prev.definitions,
                prev.formulaEntities,
              );

          return {
            ...prev,
            dimensionBreakouts,
            selectedDimensionBreakoutId: newDimensionBreakout.id,
          };
        });
        return;
      }

      addDimensionBreakout(newDimensionBreakout);
      selectDimensionBreakoutById(newDimensionBreakout.id);
    },
    [addDimensionBreakout, selectDimensionBreakoutById],
  );

  const updateActiveDimensionBreakout = useCallback(
    (
      setterFn: (
        prev: MetricsViewerDimensionBreakoutState,
      ) => MetricsViewerDimensionBreakoutState,
    ) => {
      if (!derivedData.activeDimensionBreakout) {
        return;
      }
      updateDimensionBreakout(
        derivedData.activeDimensionBreakout.id,
        setterFn(derivedData.activeDimensionBreakout),
      );
    },
    [derivedData.activeDimensionBreakout, updateDimensionBreakout],
  );

  const setShowColumnLabels = useCallback((showColumnLabels: boolean) => {
    setState((prev) => ({ ...prev, showColumnLabels }));
  }, []);

  return useMemo(
    () => ({
      definitions: state.definitions,
      formulaEntities: state.formulaEntities,
      showColumnLabels: state.showColumnLabels,
      ...derivedData,
      initialLoadComplete,
      isSidebarOpen,
      openSidebar,
      closeSidebar,

      addMetric,
      swapMetric,
      removeMetric,
      selectDimensionBreakout,
      updateActiveDimensionBreakout,
      setShowColumnLabels,
      setBreakoutDimension,
      setFormulaEntities,
    }),
    [
      state.definitions,
      state.formulaEntities,
      state.showColumnLabels,
      derivedData,
      initialLoadComplete,
      isSidebarOpen,
      openSidebar,
      closeSidebar,
      addMetric,
      swapMetric,
      removeMetric,
      selectDimensionBreakout,
      updateActiveDimensionBreakout,
      setShowColumnLabels,
      setBreakoutDimension,
      setFormulaEntities,
    ],
  );
}
