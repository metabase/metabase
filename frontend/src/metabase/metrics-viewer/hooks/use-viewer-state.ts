import { useCallback, useEffect, useRef, useState } from "react";

import { measureApi, metricApi } from "metabase/api";
import { useDispatch, useStore } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getObjectEntries, objectFromEntries } from "metabase/utils/objects";
import { isNotNull } from "metabase/utils/types";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  MetricsViewerTabState,
  StoredMetricsViewerTab,
} from "../types/viewer-state";
import {
  getInitialMetricsViewerPageState,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";
import { buildBinnedBreakoutDefinition } from "../utils/definition-builder";
import { getEffectiveDefinitionEntry } from "../utils/definition-entries";
import { computeMetricSlots } from "../utils/metric-slots";
import { remapDimensionMappings } from "../utils/remap-dimension-mappings";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { getTabConfig } from "../utils/tab-config";
import { computeDefaultTabs, findMatchingDimensionForTab } from "../utils/tabs";
import { applySerializedDefinitionInfo } from "../utils/url-serialization";

async function loadMetricDefinition(
  dispatch: ReturnType<typeof useDispatch>,
  getState: ReturnType<typeof useStore>["getState"],
  metricId: MetricId,
): Promise<MetricDefinition> {
  const result = await dispatch(
    metricApi.endpoints.getMetric.initiate(metricId),
  );
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
  const result = await dispatch(
    measureApi.endpoints.getMeasure.initiate(measureId),
  );
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

function getValidSelectedTabId(
  currentSelectedId: string | null,
  newTabs: MetricsViewerTabState[],
): string | null {
  const selectedTabExists = newTabs.some((tab) => tab.id === currentSelectedId);

  return selectedTabExists ? currentSelectedId : (newTabs[0]?.id ?? null);
}

/**
 * For each tab, find slots that have no dimension assigned yet but whose
 * definition IS loaded, and try to smart-match a dimension using the same
 * logic as `addDefinitionToTabs`.  This handles both timing orderings:
 *  - definition loaded before formula committed (called from setFormulaEntities)
 *  - formula committed before definition loaded (called from updateDefinition)
 */
function assignDimensionsForUnmappedSlots(
  tabs: MetricsViewerTabState[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
): MetricsViewerTabState[] {
  const slots = computeMetricSlots(formulaEntities);
  if (slots.length === 0) {
    return tabs;
  }

  const slotIndexToSourceId = new Map<number, MetricSourceId>();
  for (const slot of slots) {
    slotIndexToSourceId.set(slot.slotIndex, slot.sourceId);
  }

  return tabs.map((tab) => {
    if (tab.label == null) {
      return tab;
    }

    // Collect unmapped slots grouped by sourceId.
    const unmappedBySource = new Map<
      MetricSourceId,
      { slotIndices: number[]; definition: MetricDefinition }
    >();

    for (const slot of slots) {
      const existing = tab.dimensionMapping[slot.slotIndex];
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
      return tab;
    }

    // Build stored-tab representation for matching.
    const activeMappings: Record<number, string> = {};
    for (const [key, value] of getObjectEntries(tab.dimensionMapping)) {
      if (value != null) {
        activeMappings[Number(key)] = value;
      }
    }
    const storedTab: StoredMetricsViewerTab = {
      id: tab.id,
      type: tab.type,
      label: tab.label,
      dimensionBySlotIndex: activeMappings,
    };

    let newMappings: Record<number, string> | null = null;

    for (const [sourceId, { slotIndices, definition }] of unmappedBySource) {
      const existingDefinitions = objectFromEntries(
        Object.values(definitions)
          .filter((entry) => entry.id !== sourceId && entry.definition != null)
          .map((entry) => [entry.id, entry.definition] as const),
      );

      const matchingDimension = findMatchingDimensionForTab(
        definition,
        storedTab,
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
      return tab;
    }

    return {
      ...tab,
      dimensionMapping: {
        ...tab.dimensionMapping,
        ...newMappings,
      },
    };
  });
}

function areTabDimensionsValid(tab: MetricsViewerTabState): boolean {
  const tabConfig = getTabConfig(tab.type);
  return (
    Object.values(tab.dimensionMapping).filter(isNotNull).length >=
    tabConfig.minDimensions
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

  selectTab: (tabId: string) => void;
  addTab: (tab: MetricsViewerTabState) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  setDefinitionDimension: (
    tabId: string,
    slotIndex: number,
    dimension: DimensionMetadata,
  ) => void;
  removeDefinitionDimension: (tabId: string, slotIndex: number) => void;
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

        const newTabs =
          // scalar tab is always valid, but we want to remove it if there are no definitions
          // so that adding a new definition triggers computeDefaultTabs
          Object.keys(newDefinitions).length === 0
            ? []
            : prev.tabs
                .map((tab) => {
                  // Remove entries for removed slot indices.
                  // Don't shift — remapDimensionMappings handles that
                  // when formulaEntities are updated separately.
                  const newMapping: Record<number, string | null> = {};
                  for (const [key, value] of getObjectEntries(
                    tab.dimensionMapping,
                  )) {
                    const idx = Number(key);
                    if (!removedSlotIndices.has(idx)) {
                      newMapping[idx] = value;
                    }
                  }
                  return { ...tab, dimensionMapping: newMapping };
                })
                .filter((tab) => areTabDimensionsValid(tab));

        return {
          ...prev,
          definitions: newDefinitions,
          tabs: newTabs,
          selectedTabId: getValidSelectedTabId(prev.selectedTabId, newTabs),
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

        if (prev.tabs.length === 0) {
          return { ...prev, definitions: newDefinitions };
        }

        const updatedTabs = assignDimensionsForUnmappedSlots(
          prev.tabs,
          newDefinitions,
          prev.formulaEntities,
        );

        const newTabs = updatedTabs.filter((tab) => areTabDimensionsValid(tab));

        return {
          ...prev,
          definitions: newDefinitions,
          tabs: newTabs,
          selectedTabId: getValidSelectedTabId(prev.selectedTabId, newTabs),
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
        const newTabs = prev.tabs.map((tab) => {
          const newMapping = { ...tab.dimensionMapping };
          for (const idx of replacedSlotIndices) {
            delete newMapping[idx];
          }
          return { ...tab, dimensionMapping: newMapping };
        });

        return {
          ...prev,
          definitions: newDefinitions,
          formulaEntities: newFormulaEntities,
          tabs: newTabs,
        };
      }),
    [],
  );

  const selectTab = useCallback(
    (tabId: string) => setState((prev) => ({ ...prev, selectedTabId: tabId })),
    [],
  );

  const addTab = useCallback(
    (tab: MetricsViewerTabState) =>
      setState((prev) => {
        if (prev.tabs.some((existing) => existing.id === tab.id)) {
          return prev;
        }
        const newTabs = assignDimensionsForUnmappedSlots(
          [...prev.tabs, tab],
          prev.definitions,
          prev.formulaEntities,
        );
        return {
          ...prev,
          tabs: newTabs,
          selectedTabId:
            prev.selectedTabId == null ? tab.id : prev.selectedTabId,
        };
      }),
    [],
  );

  const removeTab = useCallback(
    (tabId: string) =>
      setState((prev) => {
        const newTabs = prev.tabs.filter((tab) => tab.id !== tabId);
        const needsTabSwitch = prev.selectedTabId === tabId;

        return {
          ...prev,
          tabs: newTabs,
          selectedTabId: needsTabSwitch
            ? (newTabs[0]?.id ?? null)
            : prev.selectedTabId,
        };
      }),
    [],
  );

  const updateTab = useCallback(
    (tabId: string, updates: Partial<MetricsViewerTabState>) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...updates } : tab,
        ),
      })),
    [],
  );

  const setDefinitionDimension = useCallback(
    (tabId: string, slotIndex: number, dimension: DimensionMetadata) =>
      setState((prev) => {
        const slots = computeMetricSlots(prev.formulaEntities);
        const slot = slots[slotIndex];
        if (!slot) {
          return prev;
        }

        const entry = prev.definitions[slot.sourceId];
        const def = entry?.definition;
        const dimId = def
          ? LibMetric.dimensionValuesInfo(def, dimension).id
          : undefined;

        if (!dimId) {
          return prev;
        }

        return {
          ...prev,
          tabs: prev.tabs.map((tab) => {
            if (tab.id !== tabId) {
              return tab;
            }
            return {
              ...tab,
              dimensionMapping: {
                ...tab.dimensionMapping,
                [slotIndex]: dimId,
              },
            };
          }),
        };
      }),
    [],
  );

  const removeDefinitionDimension = useCallback(
    (tabId: string, slotIndex: number) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }
          return {
            ...tab,
            dimensionMapping: { ...tab.dimensionMapping, [slotIndex]: null },
          };
        }),
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
        // filter/breakout changes, URL restore) so tabs are kept as-is.
        const reconciledTabs = slotMapping
          ? remapDimensionMappings(prev.tabs, slotMapping, formulaEntities)
          : prev.tabs;
        let tabs = assignDimensionsForUnmappedSlots(
          reconciledTabs,
          prev.definitions,
          formulaEntities,
        );

        // When tabs are empty (e.g. all metrics were removed then one was
        // added back), generate default tabs now that formulaEntities includes
        // the new metric and its definition may already be loaded.
        if (tabs.length === 0) {
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
            tabs = computeDefaultTabs(definitionsBySourceId, metricSlots);
          }
        }

        return {
          ...prev,
          formulaEntities,
          tabs,
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

            if (stateRef.current.tabs.length === 0) {
              const definitions: Record<
                MetricSourceId,
                MetricDefinition | null
              > = {
                [id]: definition,
              };
              const metricSlots = computeMetricSlots(
                stateRef.current.formulaEntities,
              );
              const tabs = computeDefaultTabs(definitions, metricSlots);
              for (const tab of tabs) {
                addTab(tab);
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
    [addDefinition, updateDefinition, removeDefinition, addTab, clearLoading],
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

    selectTab,
    addTab,
    removeTab,
    updateTab,
    setDefinitionDimension,
    removeDefinitionDimension,
    setBreakoutDimension,

    initialize,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  };
}
