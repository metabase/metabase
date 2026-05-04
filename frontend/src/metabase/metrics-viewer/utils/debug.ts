import type { MetricDatasetRequest } from "metabase-types/api/metric";

import type {
  MetricSourceId,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  MetricsViewerTabState,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";

const DEBUG_PREFIX = "[metrics-viewer-debug]";
const WINDOW_MS = 1000;
const LOG_COUNTS = new Set([1, 2, 3, 5, 10, 20, 30, 40, 50]);

type DebugCounter = {
  count: number;
  windowStartedAt: number;
};

const counters = new Map<string, DebugCounter>();

function isDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      Boolean((window as Window & { Cypress?: unknown }).Cypress) ||
      window.localStorage?.getItem("MB_METRICS_VIEWER_DEBUG") === "true"
    );
  } catch {
    return false;
  }
}

function getCounter(key: string): DebugCounter {
  const now = Date.now();
  const existing = counters.get(key);

  if (!existing || now - existing.windowStartedAt > WINDOW_MS) {
    const next = { count: 0, windowStartedAt: now };
    counters.set(key, next);
    return next;
  }

  return existing;
}

function shouldLogEvent(key: string): { count: number; shouldLog: boolean } {
  const counter = getCounter(key);
  counter.count += 1;

  return {
    count: counter.count,
    shouldLog: LOG_COUNTS.has(counter.count) || counter.count % 100 === 0,
  };
}

export function logMetricsViewerDebug(
  event: string,
  key: string,
  payload: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) {
    return;
  }

  const { count, shouldLog } = shouldLogEvent(`${event}:${key}`);
  if (!shouldLog) {
    return;
  }

  const stack =
    count >= 10
      ? new Error().stack?.split("\n").slice(2, 8).join("\n")
      : undefined;

  console.warn(`${DEBUG_PREFIX} ${event}`, {
    countInWindow: count,
    key,
    ...payload,
    ...(stack ? { stack } : {}),
  });
}

export function summarizeFormulaEntities(
  formulaEntities: MetricsViewerFormulaEntity[],
) {
  return formulaEntities.map((entity, index) => {
    if (isMetricEntry(entity)) {
      return {
        index,
        type: "metric",
        id: entity.id,
        hasDefinitionOverride: entity.definition != null,
        hasSerializedDefinitionInfo: entity.serializedDefinitionInfo != null,
      };
    }

    if (isExpressionEntry(entity)) {
      return {
        index,
        type: "expression",
        id: entity.id,
        name: entity.name,
        tokens: entity.tokens.map((token) =>
          token.type === "metric"
            ? {
                type: "metric",
                sourceId: token.sourceId,
                count: token.count,
                hasDefinitionOverride: token.definition != null,
                hasSerializedDefinitionInfo:
                  token.serializedDefinitionInfo != null,
              }
            : token,
        ),
      };
    }

    return { index, type: "unknown" };
  });
}

export function summarizeTabs(tabs: MetricsViewerTabState[]) {
  return tabs.map((tab, index) => ({
    index,
    id: tab.id,
    type: tab.type,
    label: tab.label,
    display: tab.display,
    dimensionMapping: tab.dimensionMapping,
    projectionConfig: tab.projectionConfig,
    visualizationSettings: tab.visualizationSettings,
  }));
}

export function summarizeDefinitions(
  definitions: MetricsViewerPageState["definitions"],
) {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, entry]) => [
      id,
      {
        id: entry.id,
        isLoaded: entry.definition != null,
      },
    ]),
  ) as Record<MetricSourceId, { id: MetricSourceId; isLoaded: boolean }>;
}

export function summarizeViewerState(state: MetricsViewerPageState) {
  return {
    definitionCount: Object.keys(state.definitions).length,
    definitions: summarizeDefinitions(state.definitions),
    formulaEntities: summarizeFormulaEntities(state.formulaEntities),
    tabs: summarizeTabs(state.tabs),
    selectedTabId: state.selectedTabId,
  };
}

export function summarizeViewerStateDiff(
  previous: MetricsViewerPageState,
  next: MetricsViewerPageState,
) {
  return {
    definitionsChanged: previous.definitions !== next.definitions,
    formulaEntitiesChanged: previous.formulaEntities !== next.formulaEntities,
    tabsChanged: previous.tabs !== next.tabs,
    selectedTabIdChanged: previous.selectedTabId !== next.selectedTabId,
    previousCounts: {
      definitions: Object.keys(previous.definitions).length,
      formulaEntities: previous.formulaEntities.length,
      tabs: previous.tabs.length,
      selectedTabId: previous.selectedTabId,
    },
    nextCounts: {
      definitions: Object.keys(next.definitions).length,
      formulaEntities: next.formulaEntities.length,
      tabs: next.tabs.length,
      selectedTabId: next.selectedTabId,
    },
  };
}

export function getMetricDatasetRequestDebugKey(request: MetricDatasetRequest) {
  return JSON.stringify(request, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
