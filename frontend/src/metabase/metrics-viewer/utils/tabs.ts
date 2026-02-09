import { getColumnIcon } from "metabase/common/utils/columns";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  MetricsViewerTabType,
  StoredMetricsViewerTab,
} from "../types/viewer-state";

import { MAX_AUTO_TABS, STAGE_INDEX } from "../constants";

import { findColumnByName, isDimensionColumn } from "./queries";
import { TAB_TYPE_REGISTRY, getTabConfig } from "./tab-config";

function getDimensionType(
  column: Lib.ColumnMetadata,
): MetricsViewerTabType | null {
  if (!isDimensionColumn(column)) {
    return null;
  }

  for (const config of TAB_TYPE_REGISTRY) {
    if (config.columnPredicate(column)) {
      return config.type;
    }
  }

  return null;
}

type ColumnInfo = {
  column: Lib.ColumnMetadata;
  name: string;
  displayName: string;
  type: MetricsViewerTabType;
};

export function getBreakoutColumnsByType(
  query: Lib.Query,
): Map<string, ColumnInfo> {
  const result = new Map<string, ColumnInfo>();
  const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

  for (const column of breakoutableCols) {
    if (!isDimensionColumn(column)) {
      continue;
    }

    const type = getDimensionType(column);
    if (type === null) {
      continue;
    }

    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    const name = info.name;

    if (!result.has(name)) {
      result.set(name, {
        column,
        name,
        displayName: info.displayName,
        type,
      });
    }
  }

  return result;
}

// ── Stored tab creation ──

function classifyColumnsBySource(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): Map<MetricSourceId, Map<string, ColumnInfo>> {
  const columnsBySource = new Map<MetricSourceId, Map<string, ColumnInfo>>();

  for (const sourceId of sourceOrder) {
    const query = queriesBySourceId[sourceId];
    if (!query) {
      continue;
    }
    columnsBySource.set(sourceId, getBreakoutColumnsByType(query));
  }

  return columnsBySource;
}

export function computeDefaultTabs(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState[] {
  const tabs: MetricsViewerTabState[] = [];

  if (sourceOrder.length === 0) {
    return tabs;
  }

  const columnsBySource = classifyColumnsBySource(
    queriesBySourceId,
    sourceOrder,
  );
  if (columnsBySource.size === 0) {
    return tabs;
  }

  for (const config of TAB_TYPE_REGISTRY) {
    if (!config.autoCreate) {
      continue;
    }

    if (tabs.length >= MAX_AUTO_TABS) {
      break;
    }

    if (config.matchMode === "aggregate") {
      const columnsBySourceRecord: Record<MetricSourceId, string> = {};

      if (config.columnRanker) {
        let targetRank = Infinity;
        for (const sourceId of sourceOrder) {
          const columns = columnsBySource.get(sourceId);
          if (!columns) {
            continue;
          }
          for (const [, info] of columns) {
            if (info.type === config.type) {
              const rank = config.columnRanker(info.column);
              if (rank < targetRank) {
                targetRank = rank;
              }
            }
          }
        }

        for (const sourceId of sourceOrder) {
          const columns = columnsBySource.get(sourceId);
          if (!columns) {
            continue;
          }
          for (const [, info] of columns) {
            if (info.type === config.type) {
              const rank = config.columnRanker(info.column);
              if (rank === targetRank) {
                columnsBySourceRecord[sourceId] = info.name;
                break;
              }
            }
          }
        }
      } else {
        for (const sourceId of sourceOrder) {
          const columns = columnsBySource.get(sourceId);
          if (!columns) {
            continue;
          }
          for (const [, info] of columns) {
            if (info.type === config.type) {
              columnsBySourceRecord[sourceId] = info.name;
              break;
            }
          }
        }
      }

      if (Object.keys(columnsBySourceRecord).length > 0) {
        tabs.push({
          id: config.fixedId!,
          type: config.type,
          label: config.fixedLabel!,
          display: config.defaultDisplayType,
          definitions: sourceOrder.map((id) => ({
            definitionId: id,
            projectionDimensionId: columnsBySourceRecord[id],
          })),
        });
      }
    } else {
      const uniqueColumns = new Map<
        string,
        { displayName: string; sourceIds: MetricSourceId[] }
      >();

      for (const sourceId of sourceOrder) {
        const columns = columnsBySource.get(sourceId);
        if (!columns) {
          continue;
        }

        for (const [, info] of columns) {
          if (info.type === config.type) {
            const existing = uniqueColumns.get(info.name);
            if (existing) {
              existing.sourceIds.push(sourceId);
            } else {
              uniqueColumns.set(info.name, {
                displayName: info.displayName,
                sourceIds: [sourceId],
              });
            }
          }
        }
      }

      for (const [columnName, { displayName, sourceIds }] of uniqueColumns) {
        if (tabs.length >= MAX_AUTO_TABS) {
          break;
        }

        const columnsBySourceRecord: Record<MetricSourceId, string> = {};
        for (const sourceId of sourceIds) {
          columnsBySourceRecord[sourceId] = columnName;
        }

        tabs.push({
          id: columnName,
          type: config.type,
          label: displayName,
          display: config.defaultDisplayType,
          definitions: sourceOrder.map((id) => ({
            definitionId: id,
            projectionDimensionId: columnsBySourceRecord[id],
          })),
        });
      }
    }
  }

  return tabs;
}

export function createTabFromColumn(
  columnName: string,
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): MetricsViewerTabState | null {
  const columnsBySourceRecord: Record<MetricSourceId, string> = {};
  let tabType: MetricsViewerTabType = "category";
  let displayName: string | null = null;

  for (const sourceId of sourceOrder) {
    const query = queriesBySourceId[sourceId];
    if (!query) {
      continue;
    }

    const column = findColumnByName(query, columnName);
    if (column) {
      columnsBySourceRecord[sourceId] = columnName;
      const dimensionType = getDimensionType(column);
      if (dimensionType) {
        tabType = dimensionType;
      }
      if (!displayName) {
        const columnsByType = getBreakoutColumnsByType(query);
        const columnInfo = columnsByType.get(columnName);
        displayName = columnInfo?.displayName ?? columnName;
      }
    }
  }

  if (Object.keys(columnsBySourceRecord).length === 0) {
    return null;
  }

  return {
    id: columnName,
    type: tabType,
    label: displayName ?? columnName,
    display: getTabConfig(tabType).defaultDisplayType,
    definitions: sourceOrder.map((id) => ({
      definitionId: id,
      projectionDimensionId: columnsBySourceRecord[id],
    })),
  };
}

function findExistingTabRank(
  tab: StoredMetricsViewerTab,
  columnRanker: (col: Lib.ColumnMetadata) => number,
  baseQueries?: Record<MetricSourceId, Lib.Query | null>,
): number | null {
  if (!baseQueries) {
    return null;
  }

  for (const [sourceId, columnName] of Object.entries(tab.columnsBySource)) {
    const q = baseQueries[sourceId as MetricSourceId];
    if (!q) {
      continue;
    }
    const cols = getBreakoutColumnsByType(q);
    const col = cols.get(columnName);
    if (col) {
      return columnRanker(col.column);
    }
  }
  return null;
}

function findBestRankInColumns(
  columnsByType: Map<string, ColumnInfo>,
  tabType: MetricsViewerTabType,
  columnRanker: (col: Lib.ColumnMetadata) => number,
): number | null {
  let best: number | null = null;
  for (const [, info] of columnsByType) {
    if (info.type === tabType) {
      const rank = columnRanker(info.column);
      if (best === null || rank < best) {
        best = rank;
      }
    }
  }
  return best;
}

export function findMatchingColumnForTab(
  query: Lib.Query,
  tab: StoredMetricsViewerTab,
  baseQueries?: Record<MetricSourceId, Lib.Query | null>,
): string | null {
  const columnsByType = getBreakoutColumnsByType(query);
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);

  if (config?.matchMode === "aggregate") {
    if (config.columnRanker) {
      let targetRank = findExistingTabRank(
        tab,
        config.columnRanker,
        baseQueries,
      );

      if (targetRank === null) {
        targetRank = findBestRankInColumns(
          columnsByType,
          config.type,
          config.columnRanker,
        );
      }

      if (targetRank !== null) {
        for (const [, info] of columnsByType) {
          if (
            info.type === config.type &&
            config.columnRanker(info.column) === targetRank
          ) {
            return info.name;
          }
        }
      }
      return null;
    }

    for (const [, info] of columnsByType) {
      if (info.type === tab.type) {
        return info.name;
      }
    }
    return null;
  }

  const matchingColumn = columnsByType.get(tab.id);
  if (matchingColumn && matchingColumn.type === tab.type) {
    return matchingColumn.name;
  }

  return null;
}

export interface AvailableDimension {
  dimensionName: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: MetricsViewerTabType;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

export function getAvailableDimensionsForPicker(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>,
  existingTabIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = {
    shared: [],
    bySource: {},
  };

  if (sourceOrder.length === 0) {
    return result;
  }

  const allDimensionsBySource = new Map<
    MetricSourceId,
    Map<
      string,
      {
        column: Lib.ColumnMetadata;
        label: string;
        icon: IconName;
        tabType: MetricsViewerTabType;
      }
    >
  >();

  for (const sourceId of sourceOrder) {
    const query = queriesBySourceId[sourceId];
    if (!query) {
      continue;
    }

    const dimensionsMap = new Map<
      string,
      {
        column: Lib.ColumnMetadata;
        label: string;
        icon: IconName;
        tabType: MetricsViewerTabType;
      }
    >();
    const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

    for (const column of breakoutableCols) {
      if (!isDimensionColumn(column)) {
        continue;
      }

      const info = Lib.displayInfo(query, STAGE_INDEX, column);
      const dimensionName = info.name;

      if (existingTabIds.has(dimensionName)) {
        continue;
      }

      const tabType = getDimensionType(column);
      if (!tabType) {
        continue;
      }

      if (!dimensionsMap.has(dimensionName)) {
        dimensionsMap.set(dimensionName, {
          column,
          label: info.displayName ?? dimensionName,
          icon: getColumnIcon(column),
          tabType,
        });
      }
    }

    allDimensionsBySource.set(sourceId, dimensionsMap);
  }

  interface DimensionMeta {
    label: string;
    icon: IconName;
    tabType: MetricsViewerTabType;
    sourceIds: MetricSourceId[];
  }

  const dimensionMetas = new Map<string, DimensionMeta>();

  for (const [sourceId, dimensions] of allDimensionsBySource) {
    for (const [dimensionName, { label, icon, tabType }] of dimensions) {
      const existing = dimensionMetas.get(dimensionName);
      if (existing) {
        existing.sourceIds.push(sourceId);
      } else {
        dimensionMetas.set(dimensionName, {
          label,
          icon,
          tabType,
          sourceIds: [sourceId],
        });
      }
    }
  }

  const loadedSourceCount = allDimensionsBySource.size;
  const hasMultipleSources = loadedSourceCount > 1;

  const sharedDimensionNames = new Set<string>();
  if (hasMultipleSources) {
    for (const [dimensionName, meta] of dimensionMetas) {
      if (meta.sourceIds.length === loadedSourceCount) {
        sharedDimensionNames.add(dimensionName);
        result.shared.push({ dimensionName, ...meta });
      }
    }
    result.shared.sort((a, b) => a.label.localeCompare(b.label));
  }

  for (const sourceId of sourceOrder) {
    const dimensions = allDimensionsBySource.get(sourceId);
    if (!dimensions) {
      continue;
    }

    result.bySource[sourceId] = [];

    for (const [dimensionName, { label, icon, tabType }] of dimensions) {
      if (!hasMultipleSources || !sharedDimensionNames.has(dimensionName)) {
        result.bySource[sourceId].push({
          dimensionName,
          label,
          icon,
          sourceIds: [sourceId],
          tabType,
        });
      }
    }

    result.bySource[sourceId].sort((a, b) => a.label.localeCompare(b.label));
  }

  return result;
}

export interface SourceDisplayInfo {
  type: "metric" | "measure";
  name: string;
}

export function getSourceDisplayName(
  sourceId: MetricSourceId,
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>,
): string {
  return sourceDataById[sourceId]?.name ?? sourceId;
}
