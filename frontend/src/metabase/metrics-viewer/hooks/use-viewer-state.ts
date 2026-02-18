import { useCallback, useState } from "react";

import { objectFromEntries } from "metabase/lib/objects";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

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
import { findMatchingDimensionForTab } from "../utils/tabs";

function getValidSelectedTabId(
  currentSelectedId: string | null,
  newTabs: MetricsViewerTabState[],
): string | null {
  const selectedTabExists =
    currentSelectedId === ALL_TAB_ID ||
    newTabs.some((tab) => tab.id === currentSelectedId);

  return selectedTabExists ? currentSelectedId : (newTabs[0]?.id ?? null);
}

export interface UseViewerStateResult {
  state: MetricsViewerPageState;

  addDefinition: (entry: MetricsViewerDefinitionEntry) => void;
  removeDefinition: (id: MetricSourceId) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;
  replaceDefinition: (
    oldId: MetricSourceId,
    newEntry: MetricsViewerDefinitionEntry,
  ) => void;

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

export function useViewerState(): UseViewerStateResult {
  const [state, setState] = useState<MetricsViewerPageState>(
    getInitialMetricsViewerPageState,
  );

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
            return {
              ...tab,
              dimensionMapping: {
                ...tab.dimensionMapping,
                [definitionId]: dimId,
              },
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

  return {
    state,
    addDefinition,
    removeDefinition,
    updateDefinition,
    replaceDefinition,
    selectTab,
    addTab,
    removeTab,
    updateTab,
    setDefinitionDimension,
    setBreakoutDimension,
    initialize,
  };
}
