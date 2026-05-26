import { useCallback, useEffect, useRef, useState } from "react";

import { measureApi, metricApi, segmentApi } from "metabase/api";
import { useDispatch, useStore } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getObjectEntries, objectFromEntries } from "metabase/utils/objects";
import { isNotNull } from "metabase/utils/types";
import type { MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  StoredMetricsViewerDimensionBreakout,
} from "../types/viewer-state";
import {
  getInitialMetricsViewerPageState,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";
import { buildBinnedBreakoutDefinition } from "../utils/definition-builder";
import { getEffectiveDefinitionEntry } from "../utils/definition-entries";
import { getDimensionBreakoutConfig } from "../utils/dimension-breakout-config";
import {
  computeDefaultDimensionBreakouts,
  findMatchingDimensionForBreakout,
} from "../utils/dimension-breakouts";
import { computeMetricSlots } from "../utils/metric-slots";
import { remapDimensionMappings } from "../utils/remap-dimension-mappings";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { applySerializedDefinitionInfo } from "../utils/url-serialization";

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

function getValidSelectedDimensionBreakoutId(
  currentSelectedDimensionBreakoutId: string | null,
  newDimensionBreakouts: MetricsViewerDimensionBreakoutState[],
): string | null {
  const selectedDimensionBreakoutExists = newDimensionBreakouts.some(
    (dimensionBreakout) =>
      dimensionBreakout.id === currentSelectedDimensionBreakoutId,
  );

  return selectedDimensionBreakoutExists
    ? currentSelectedDimensionBreakoutId
    : (newDimensionBreakouts[0]?.id ?? null);
}

/**
 * For each dimensionBreakout, find slots that have no dimension assigned yet but whose
 * definition IS loaded, and try to smart-match a dimension using the same
 * logic as `addDefinitionToDimensionBreakouts`. This handles both timing orderings:
 *  - definition loaded before formula committed (called from setFormulaEntities)
 *  - formula committed before definition loaded (called from updateDefinition)
 */
function assignDimensionsForUnmappedSlots(
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
): MetricsViewerDimensionBreakoutState[] {
  const slots = computeMetricSlots(formulaEntities);
  if (slots.length === 0) {
    return dimensionBreakouts;
  }

  const slotIndexToSourceId = new Map<number, MetricSourceId>();
  for (const slot of slots) {
    slotIndexToSourceId.set(slot.slotIndex, slot.sourceId);
  }

  return dimensionBreakouts.map((dimensionBreakout) => {
    if (dimensionBreakout.label == null) {
      return dimensionBreakout;
    }

    // Collect unmapped slots grouped by sourceId.
    const unmappedBySource = new Map<
      MetricSourceId,
      { slotIndices: number[]; definition: MetricDefinition }
    >();

    for (const slot of slots) {
      const existing = dimensionBreakout.dimensionMapping[slot.slotIndex];
      if (existing !== undefined) {
        continue; // already mapped (even if null — that's an explicit clear)
      }
      const defEntry = definitions[slot.sourceId];
      if (!defEntry?.definition) {
        continue; // definition not loaded yet
      }
      let group = unmappedBySource.get(slot.sourceId);
      if (!group) {
        group = { slotIndices: [], definition: defEntry.definition };
        unmappedBySource.set(slot.sourceId, group);
      }
      group.slotIndices.push(slot.slotIndex);
    }

    if (unmappedBySource.size === 0) {
      return dimensionBreakout;
    }

    // Build stored dimension breakout representation for matching.
    const activeMappings: Record<number, string> = {};
    for (const [key, value] of getObjectEntries(
      dimensionBreakout.dimensionMapping,
    )) {
      if (value != null) {
        activeMappings[Number(key)] = value;
      }
    }
    const storedDimensionBreakout: StoredMetricsViewerDimensionBreakout = {
      id: dimensionBreakout.id,
      type: dimensionBreakout.type,
      label: dimensionBreakout.label,
      dimensionBySlotIndex: activeMappings,
    };

    let newMappings: Record<number, string> | null = null;

    for (const [sourceId, { slotIndices, definition }] of unmappedBySource) {
      const existingDefinitions = objectFromEntries(
        Object.values(definitions)
          .filter((entry) => entry.id !== sourceId && entry.definition != null)
          .map((entry) => [entry.id, entry.definition] as const),
      );

      const matchingDimension = findMatchingDimensionForBreakout(
        definition,
        storedDimensionBreakout,
        existingDefinitions,
        slotIndexToSourceId,
      );

      if (matchingDimension) {
        if (!newMappings) {
          newMappings = {};
        }
        for (const idx of slotIndices) {
          newMappings[idx] = matchingDimension;
        }
      }
    }

    if (!newMappings) {
      return dimensionBreakout;
    }

    return {
      ...dimensionBreakout,
      dimensionMapping: {
        ...dimensionBreakout.dimensionMapping,
        ...newMappings,
      },
    };
  });
}

function areDimensionBreakoutDimensionsValid(
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
): boolean {
  const dimensionBreakoutConfig = getDimensionBreakoutConfig(
    dimensionBreakout.type,
  );
  return (
    Object.values(dimensionBreakout.dimensionMapping).filter(isNotNull)
      .length >= dimensionBreakoutConfig.minDimensions
  );
}

export interface UseViewerStateResult {
  state: MetricsViewerPageState;
  loadingIds: Set<MetricSourceId>;
  initialLoadComplete: boolean;
  setInitialLoadComplete: (initialLoadComplete: boolean) => void;

  removeDefinition: (id: MetricSourceId) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;
  setFormulaEntities: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;

  selectDimensionBreakoutById: (dimensionBreakoutId: string) => void;
  addDimensionBreakout: (
    dimensionBreakout: MetricsViewerDimensionBreakoutState,
  ) => void;
  updateDimensionBreakout: (
    dimensionBreakoutId: string,
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
  setBreakoutDimension: (
    entity: MetricDefinitionEntry,
    dimension: ProjectionClause | undefined,
  ) => void;

  initialize: (state: MetricsViewerPageState) => void;
  loadAndAddMetric: (
    metricId: MetricId,
    transform?: (def: MetricDefinition) => MetricDefinition,
  ) => void;
  loadAndAddMeasure: (
    measureId: MeasureId,
    transform?: (def: MetricDefinition) => MetricDefinition,
  ) => void;
  loadAndReplaceMetric: (
    oldSourceId: MetricSourceId,
    metricId: MetricId,
  ) => void;
  loadAndReplaceMeasure: (
    oldSourceId: MetricSourceId,
    measureId: MeasureId,
  ) => void;
}

export function useViewerState(): UseViewerStateResult {
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

        return {
          ...prev,
          formulaEntities,
          dimensionBreakouts,
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

  return {
    state,
    loadingIds,
    initialLoadComplete,
    setInitialLoadComplete,

    removeDefinition,
    updateDefinition,
    setFormulaEntities,

    selectDimensionBreakoutById,
    addDimensionBreakout,
    updateDimensionBreakout,
    setBreakoutDimension,

    initialize,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  };
}
