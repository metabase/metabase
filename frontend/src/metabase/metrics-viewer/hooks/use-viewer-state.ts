import { useCallback, useState } from "react";

import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";

import { ALL_TAB_ID } from "../constants";
import type {
  DefinitionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerPageState,
  MetricsViewerTabState,
  StoredMetricsViewerTab,
} from "../types/viewer-state";
import { getInitialMetricsViewerPageState } from "../types/viewer-state";
import { TAB_TYPE_REGISTRY } from "../utils/tab-config";
import { findMatchingDimensionForTab } from "../utils/tabs";

export interface UseViewerStateResult {
  state: MetricsViewerPageState;

  addDefinition: (entry: MetricsViewerDefinitionEntry) => void;
  removeDefinition: (id: DefinitionId) => void;
  updateDefinition: (id: DefinitionId, definition: MetricDefinition) => void;
  replaceDefinition: (
    oldId: DefinitionId,
    newEntry: MetricsViewerDefinitionEntry,
  ) => void;

  selectTab: (tabId: string) => void;
  addTab: (tab: MetricsViewerTabState) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  setDefinitionDimension: (
    tabId: string,
    definitionId: DefinitionId,
    dimensionId: string | undefined,
  ) => void;
  setBreakoutDimension: (
    id: DefinitionId,
    dimension: DimensionMetadata | undefined,
  ) => void;

  initialize: (state: MetricsViewerPageState) => void;
}

function addDefinitionToTabs(
  tabs: MetricsViewerTabState[],
  definitionEntries: MetricsViewerDefinitionEntry[],
  newDefId: DefinitionId,
  newDef: MetricDefinition,
): MetricsViewerTabState[] {
  const existingDefs = Object.fromEntries(
    definitionEntries
      .filter((d) => d.id !== newDefId)
      .map((d) => [d.id, d.definition]),
  ) as Record<MetricSourceId, MetricDefinition | null>;

  return tabs.map((tab) => {
    const existingIndex = tab.definitions.findIndex(
      (td) => td.definitionId === newDefId,
    );

    if (
      existingIndex !== -1 &&
      tab.definitions[existingIndex].projectionDimensionId != null
    ) {
      return tab;
    }

    const storedTab: StoredMetricsViewerTab = {
      id: tab.id,
      type: tab.type,
      label: tab.label,
      dimensionsBySource: Object.fromEntries(
        tab.definitions
          .filter((td) => td.projectionDimensionId && td.definitionId !== newDefId)
          .map((td) => [td.definitionId, td.projectionDimensionId]),
      ),
    };

    const matchingDim = findMatchingDimensionForTab(
      newDef,
      storedTab,
      existingDefs,
    );

    if (existingIndex !== -1) {
      if (!matchingDim) {
        return tab;
      }
      const newDefs = [...tab.definitions];
      newDefs[existingIndex] = {
        definitionId: newDefId,
        projectionDimensionId: matchingDim,
      };
      return { ...tab, definitions: newDefs };
    }

    if (matchingDim) {
      return {
        ...tab,
        definitions: [
          ...tab.definitions,
          {
            definitionId: newDefId,
            projectionDimensionId: matchingDim,
          },
        ],
      };
    }

    const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);
    if (config?.matchMode === "exact-column") {
      return {
        ...tab,
        definitions: [
          ...tab.definitions,
          {
            definitionId: newDefId,
            projectionDimensionId: undefined,
          },
        ],
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
    (id: DefinitionId) =>
      setState((prev) => {
        const newDefinitions = prev.definitions.filter((d) => d.id !== id);
        const newTabs = prev.tabs
          .map((tab) => ({
            ...tab,
            definitions: tab.definitions.filter((td) => td.definitionId !== id),
          }))
          .filter((tab) => tab.definitions.length > 0);

        const selectedTabExists =
          prev.selectedTabId === ALL_TAB_ID ||
          newTabs.some((t) => t.id === prev.selectedTabId);

        return {
          ...prev,
          definitions: newDefinitions,
          tabs: newTabs,
          selectedTabId: selectedTabExists
            ? prev.selectedTabId
            : (newTabs[0]?.id ?? null),
        };
      }),
    [],
  );

  const updateDefinition = useCallback(
    (id: DefinitionId, definition: MetricDefinition) =>
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

        const newTabs = updatedTabs.filter((tab) =>
          tab.definitions.some((td) => td.projectionDimensionId != null),
        );

        const selectedTabExists =
          prev.selectedTabId === ALL_TAB_ID ||
          newTabs.some((t) => t.id === prev.selectedTabId);

        return {
          ...prev,
          definitions: newDefinitions,
          tabs: newTabs,
          selectedTabId: selectedTabExists
            ? prev.selectedTabId
            : (newTabs[0]?.id ?? null),
        };
      }),
    [],
  );

  const replaceDefinition = useCallback(
    (oldId: DefinitionId, newEntry: MetricsViewerDefinitionEntry) =>
      setState((prev) => {
        const index = prev.definitions.findIndex((d) => d.id === oldId);
        if (index === -1) {
          return prev;
        }

        const newDefinitions = [...prev.definitions];
        newDefinitions[index] = newEntry;

        const newTabs = prev.tabs.map((tab) => ({
          ...tab,
          definitions: tab.definitions.map((td) =>
            td.definitionId === oldId
              ? { definitionId: newEntry.id, projectionDimensionId: undefined }
              : td,
          ),
        }));

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
      definitionId: DefinitionId,
      dimensionId: string | undefined,
    ) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }
          return {
            ...tab,
            definitions: tab.definitions.map((td) =>
              td.definitionId === definitionId
                ? { ...td, projectionDimensionId: dimensionId }
                : td,
            ),
          };
        }),
      })),
    [],
  );

  const setBreakoutDimension = useCallback(
    (id: DefinitionId, dimension: DimensionMetadata | undefined) =>
      setState((prev) => ({
        ...prev,
        definitions: prev.definitions.map((d) =>
          d.id === id ? { ...d, breakoutDimension: dimension } : d,
        ),
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
