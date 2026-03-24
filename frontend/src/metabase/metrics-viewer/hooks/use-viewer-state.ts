import { useCallback, useRef, useState } from "react";

import { measureApi, metricApi } from "metabase/api";
import { getObjectEntries, objectFromEntries } from "metabase/lib/objects";
import { useDispatch, useStore } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  MetricsViewerTabState,
  StoredMetricsViewerTab,
} from "../types/viewer-state";
import { getInitialMetricsViewerPageState } from "../types/viewer-state";
import { buildBinnedBreakoutDefinition } from "../utils/definition-builder";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { getTabConfig } from "../utils/tab-config";
import { computeDefaultTabs, findMatchingDimensionForTab } from "../utils/tabs";

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

function addDefinitionToTabs(
  tabs: MetricsViewerTabState[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  newDefId: MetricSourceId,
  newDef: MetricDefinition,
): MetricsViewerTabState[] {
  const existingDefinitions = objectFromEntries(
    Object.values(definitions)
      .filter((entry) => entry.id !== newDefId)
      .map((entry) => [entry.id, entry.definition] as const),
  );

  return tabs.map((tab) => {
    if (newDefId in tab.dimensionMapping) {
      return tab;
    }

    const activeMappings = objectFromEntries(
      getObjectEntries(tab.dimensionMapping).filter(
        (entry): entry is [MetricSourceId, string] => entry[1] != null,
      ),
    );
    const storedTab: StoredMetricsViewerTab = {
      id: tab.id,
      type: tab.type,
      label: tab.label,
      dimensionsBySource: activeMappings,
    };

    const matchingDimension = findMatchingDimensionForTab(
      newDef,
      storedTab,
      existingDefinitions,
    );

    if (matchingDimension) {
      return {
        ...tab,
        dimensionMapping: {
          ...tab.dimensionMapping,
          [newDefId]: matchingDimension,
        },
      };
    }

    return tab;
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

  removeDefinition: (id: MetricSourceId) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;
  setFormulaEntities: (entities: MetricsViewerFormulaEntity[]) => void;

  selectTab: (tabId: string) => void;
  addTab: (tab: MetricsViewerTabState) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  setDefinitionDimension: (
    tabId: string,
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  removeDefinitionDimension: (
    tabId: string,
    definitionId: MetricSourceId,
  ) => void;
  setBreakoutDimension: (
    id: MetricSourceId,
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

  const initialize: (newState: MetricsViewerPageState) => void = setState;

  const addDefinition = useCallback(
    (entry: MetricsViewerDefinitionEntry) =>
      setState((prev) => {
        if (entry.id in prev.definitions) {
          return prev;
        }

        const newDefinitions = {
          ...prev.definitions,
          [entry.id]: entry,
        };

        if (prev.tabs.length === 0 || !entry.definition) {
          return {
            ...prev,
            definitions: newDefinitions,
          };
        }

        return {
          ...prev,
          definitions: newDefinitions,
          tabs: addDefinitionToTabs(
            prev.tabs,
            newDefinitions,
            entry.id,
            entry.definition,
          ),
        };
      }),
    [],
  );

  const removeDefinition = useCallback(
    (id: MetricSourceId) =>
      setState((prev) => {
        const { [id]: _, ...newDefinitions } = prev.definitions;
        const newTabs =
          // scalar tab is always valid, but we want to remove it if there are no definitions
          // so that adding a new definition triggers computeDefaultTabs
          Object.keys(newDefinitions).length === 0
            ? []
            : prev.tabs
                .map((tab) => {
                  const { [id]: __, ...rest } = tab.dimensionMapping;
                  return { ...tab, dimensionMapping: rest };
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

        const updatedTabs = addDefinitionToTabs(
          prev.tabs,
          newDefinitions,
          id,
          definition,
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

        const { [oldId]: _, ...rest } = prev.definitions;
        const newDefinitions = { ...rest, [newEntry.id]: newEntry };

        // Update formulaEntities: replace the old metric ref with the new one
        const newFormulaEntities = prev.formulaEntities.map((fe) => {
          if (fe.type === "metric" && fe.id === oldId) {
            return { ...newEntry, type: "metric" as const };
          }
          return fe;
        });

        const newTabs = prev.tabs.map((tab) => {
          if (!(oldId in tab.dimensionMapping)) {
            return tab;
          }
          const { [oldId]: __, ...tabRest } = tab.dimensionMapping;
          return { ...tab, dimensionMapping: tabRest };
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
        return {
          ...prev,
          tabs: [...prev.tabs, tab],
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
    (
      tabId: string,
      definitionId: MetricSourceId,
      dimension: DimensionMetadata,
    ) =>
      setState((prev) => {
        const entry = prev.definitions[definitionId];
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
            const previousDimId = tab.dimensionMapping[definitionId];
            const dimensionChanged = previousDimId !== dimId;
            return {
              ...tab,
              dimensionMapping: {
                ...tab.dimensionMapping,
                [definitionId]: dimId,
              },
              projectionConfig: dimensionChanged
                ? {
                    ...tab.projectionConfig,
                    dimensionFilter: undefined,
                  }
                : tab.projectionConfig,
            };
          }),
        };
      }),
    [],
  );

  const removeDefinitionDimension = useCallback(
    (tabId: string, definitionId: MetricSourceId) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }
          return {
            ...tab,
            dimensionMapping: { ...tab.dimensionMapping, [definitionId]: null },
            projectionConfig: {
              ...tab.projectionConfig,
              dimensionFilter: undefined,
            },
          };
        }),
      })),
    [],
  );

  const setFormulaEntities = useCallback(
    (formulaEntities: MetricsViewerFormulaEntity[]) =>
      setState((prev) => ({ ...prev, formulaEntities })),
    [],
  );

  const setBreakoutDimension = useCallback(
    (id: MetricSourceId, dimension: ProjectionClause | undefined) =>
      setState((prev) => {
        const entry = prev.definitions[id];
        if (!entry || !entry.definition) {
          return prev;
        }

        let newDefinition = entry.definition;
        const existingProjections = LibMetric.projections(newDefinition);
        for (const proj of existingProjections) {
          newDefinition = LibMetric.removeClause(newDefinition, proj);
        }

        if (dimension) {
          newDefinition = buildBinnedBreakoutDefinition(
            newDefinition,
            dimension,
          );
        }

        return {
          ...prev,
          definitions: {
            ...prev.definitions,
            [id]: { ...entry, definition: newDefinition },
          },
        };
      }),
    [],
  );

  const clearLoading = useCallback((id: MetricSourceId) => {
    loadingRef.current.delete(id);
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
          const definition = transform
            ? transform(rawDefinition)
            : rawDefinition;
          updateDefinition(id, definition);

          if (stateRef.current.tabs.length === 0) {
            const definitions: Record<MetricSourceId, MetricDefinition | null> =
              {
                [id]: definition,
              };
            const tabs = computeDefaultTabs(definitions, [id]);
            for (const tab of tabs) {
              addTab(tab);
            }
          }
        }, 0);
      } catch {
        removeDefinition(id);
      } finally {
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
          updateDefinition(newId, definition);
        }, 0);
      } catch {
        removeDefinition(newId);
      } finally {
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

  return {
    state,
    loadingIds,

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
