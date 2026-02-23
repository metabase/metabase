import { useCallback, useRef, useState } from "react";

import { objectFromEntries } from "metabase/lib/objects";
import { useDispatch, useStore } from "metabase/lib/redux";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import {
  loadMeasureDefinition,
  loadMetricDefinition,
} from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerPageState,
  MetricsViewerTabState,
  StoredMetricsViewerTab,
} from "../types/viewer-state";
import { getInitialMetricsViewerPageState } from "../types/viewer-state";
import { buildBinnedBreakoutDef } from "../utils/metrics";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { computeDefaultTabs, findMatchingDimensionForTab } from "../utils/tabs";

function getValidSelectedTabId(
  currentSelectedId: string | null,
  newTabs: MetricsViewerTabState[],
): string | null {
  const selectedTabExists =
    currentSelectedId === ALL_TAB_ID ||
    newTabs.some((tab) => tab.id === currentSelectedId);

  return selectedTabExists ? currentSelectedId : (newTabs[0]?.id ?? null);
}

function addDefinitionToTabs(
  tabs: MetricsViewerTabState[],
  definitionEntries: MetricsViewerDefinitionEntry[],
  newDefId: MetricSourceId,
  newDef: MetricDefinition,
): MetricsViewerTabState[] {
  const existingDefinitions = objectFromEntries(
    definitionEntries
      .filter((entry) => entry.id !== newDefId)
      .map((entry) => [entry.id, entry.definition] as const),
  );

  return tabs.map((tab) => {
    const existingDimensionId = tab.dimensionMapping[newDefId];
    if (existingDimensionId != null) {
      return tab;
    }

    const { [newDefId]: _, ...otherMappings } = tab.dimensionMapping;
    const storedTab: StoredMetricsViewerTab = {
      id: tab.id,
      type: tab.type,
      label: tab.label,
      dimensionsBySource: otherMappings,
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

export interface UseViewerStateResult {
  state: MetricsViewerPageState;
  loadingIds: Set<MetricSourceId>;

  removeDefinition: (id: MetricSourceId) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;

  selectTab: (tabId: string) => void;
  addTab: (tab: MetricsViewerTabState) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  setDefinitionDimension: (
    tabId: string,
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  setBreakoutDimension: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;

  initialize: (state: MetricsViewerPageState) => void;
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

  const initialize = useCallback(
    (newState: MetricsViewerPageState) => setState(newState),
    [],
  );

  const addDefinition = useCallback(
    (entry: MetricsViewerDefinitionEntry) =>
      setState((prev) => {
        if (prev.definitions.some((d) => d.id === entry.id)) {
          return prev;
        }

        const newDefinitions = [...prev.definitions, entry];

        if (prev.tabs.length === 0 || !entry.definition) {
          return { ...prev, definitions: newDefinitions };
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
        const newDefinitions = prev.definitions.filter((d) => d.id !== id);
        const newTabs = prev.tabs
          .map((tab) => {
            const { [id]: _, ...rest } = tab.dimensionMapping;
            return { ...tab, dimensionMapping: rest };
          })
          .filter((tab) => Object.keys(tab.dimensionMapping).length > 0);

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
        const newDefinitions = prev.definitions.map((d) =>
          d.id === id ? { ...d, definition } : d,
        );

        if (prev.tabs.length === 0) {
          return { ...prev, definitions: newDefinitions };
        }

        const updatedTabs = addDefinitionToTabs(
          prev.tabs,
          newDefinitions,
          id,
          definition,
        );

        const newTabs = updatedTabs.filter(
          (tab) => Object.keys(tab.dimensionMapping).length > 0,
        );

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
        const index = prev.definitions.findIndex((d) => d.id === oldId);
        if (index === -1) {
          return prev;
        }

        const newDefinitions = [...prev.definitions];
        newDefinitions[index] = newEntry;

        const newTabs = prev.tabs.map((tab) => {
          if (!(oldId in tab.dimensionMapping)) {
            return tab;
          }
          const { [oldId]: _, ...rest } = tab.dimensionMapping;
          return { ...tab, dimensionMapping: rest };
        });

        return { ...prev, definitions: newDefinitions, tabs: newTabs };
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
        if (prev.tabs.some((t) => t.id === tab.id)) {
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
        const newTabs = prev.tabs.filter((t) => t.id !== tabId);
        const needsTabSwitch =
          prev.selectedTabId === tabId ||
          (prev.selectedTabId === ALL_TAB_ID && newTabs.length <= 1);

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
        const entry = prev.definitions.find((d) => d.id === definitionId);
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

  const setBreakoutDimension = useCallback(
    (id: MetricSourceId, dimension: ProjectionClause | undefined) =>
      setState((prev) => ({
        ...prev,
        definitions: prev.definitions.map((entry) => {
          if (entry.id !== id || !entry.definition) {
            return entry;
          }

          let newDefinition = entry.definition;
          const existingProjections = LibMetric.projections(newDefinition);
          for (const proj of existingProjections) {
            newDefinition = LibMetric.removeClause(newDefinition, proj);
          }

          if (dimension) {
            newDefinition = buildBinnedBreakoutDef(newDefinition, dimension);
          }

          return { ...entry, definition: newDefinition };
        }),
      })),
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
    async (id: MetricSourceId, loader: () => Promise<MetricDefinition>) => {
      if (loadingRef.current.has(id)) {
        return;
      }

      loadingRef.current.add(id);
      setLoadingIds((prev) => new Set(prev).add(id));
      addDefinition({ id, definition: null });

      try {
        const definition = await loader();
        updateDefinition(id, definition);

        if (stateRef.current.tabs.length === 0) {
          const definitions: Record<MetricSourceId, MetricDefinition | null> = {
            [id]: definition,
          };
          const tabs = computeDefaultTabs(definitions, [id]);
          for (const tab of tabs) {
            addTab(tab);
          }
        }
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
      replaceDefinition(oldSourceId, { id: newId, definition: null });

      try {
        const definition = await loader();
        updateDefinition(newId, definition);
      } catch {
        removeDefinition(newId);
      } finally {
        clearLoading(newId);
      }
    },
    [replaceDefinition, updateDefinition, removeDefinition, clearLoading],
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
    state,
    loadingIds,

    removeDefinition,
    updateDefinition,

    selectTab,
    addTab,
    removeTab,
    updateTab,
    setDefinitionDimension,
    setBreakoutDimension,

    initialize,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  };
}
