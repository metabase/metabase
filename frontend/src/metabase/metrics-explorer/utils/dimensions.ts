import { getColumnIcon } from "metabase/common/utils/columns";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  DimensionTab,
  DimensionTabColumn,
  DimensionTabType,
  MetricSourceId,
  SourceData,
  StoredDimensionTab,
} from "metabase-types/store/metrics-explorer";

import {
  MAX_AUTO_TABS,
  TAB_TYPE_REGISTRY,
  isDimensionColumn,
  isGeoColumn,
} from "./tab-registry";

const STAGE_INDEX = -1;

// ============================================================
// COLUMN CLASSIFICATION
// ============================================================

export function getDimensionType(
  column: Lib.ColumnMetadata,
): DimensionTabType | null {
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

// ============================================================
// COLUMN INFO
// ============================================================

interface ColumnInfo {
  column: Lib.ColumnMetadata;
  name: string;
  displayName: string;
  type: DimensionTabType;
}

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

// ============================================================
// COLUMN LOOKUP
// ============================================================

function findColumnByName(
  query: Lib.Query,
  columnName: string,
): Lib.ColumnMetadata | null {
  const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

  for (const column of breakoutableCols) {
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    if (info.name === columnName) {
      const bucketedColumn = Lib.withDefaultBucket(query, STAGE_INDEX, column);
      return bucketedColumn ?? column;
    }
  }

  return null;
}

// ============================================================
// STORED TAB CREATION
// ============================================================

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
): StoredDimensionTab[] {
  const tabs: StoredDimensionTab[] = [];

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
          columnsBySource: columnsBySourceRecord,
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
          columnsBySource: columnsBySourceRecord,
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
): StoredDimensionTab | null {
  const columnsBySourceRecord: Record<MetricSourceId, string> = {};
  let tabType: DimensionTabType = "category";
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
    columnsBySource: columnsBySourceRecord,
  };
}

function findExistingTabRank(
  tab: StoredDimensionTab,
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
  tabType: DimensionTabType,
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
  tab: StoredDimensionTab,
  baseQueries?: Record<MetricSourceId, Lib.Query | null>,
): string | null {
  const columnsByType = getBreakoutColumnsByType(query);
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === tab.type);

  if (config?.matchMode === "aggregate") {
    if (config.columnRanker) {
      let targetRank = findExistingTabRank(tab, config.columnRanker, baseQueries);

      if (targetRank === null) {
        targetRank = findBestRankInColumns(columnsByType, config.type, config.columnRanker);
      }

      if (targetRank !== null) {
        for (const [, info] of columnsByType) {
          if (info.type === config.type && config.columnRanker(info.column) === targetRank) {
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

export function hydrateTabColumns(
  storedTab: StoredDimensionTab,
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
): DimensionTab {
  const columnsBySource: DimensionTabColumn[] = [];

  for (const [sourceId, columnName] of Object.entries(
    storedTab.columnsBySource,
  )) {
    const query = queriesBySourceId[sourceId as MetricSourceId];
    if (!query) {
      continue;
    }

    const column = findColumnByName(query, columnName);
    if (column) {
      columnsBySource.push({
        sourceId: sourceId as MetricSourceId,
        column,
        columnName,
      });
    }
  }

  return {
    id: storedTab.id,
    type: storedTab.type,
    label: storedTab.label,
    columnsBySource,
    projectionConfig: storedTab.projectionConfig,
    displayType: storedTab.displayType,
  };
}

// ============================================================
// AVAILABLE COLUMNS FOR PICKER
// ============================================================

export interface AvailableColumn {
  columnName: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: DimensionTabType;
}

export interface AvailableColumnsResult {
  shared: AvailableColumn[];
  bySource: Record<MetricSourceId, AvailableColumn[]>;
}

export function getAvailableColumnsForPicker(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceData>,
  existingTabIds: Set<string>,
): AvailableColumnsResult {
  const result: AvailableColumnsResult = {
    shared: [],
    bySource: {},
  };

  if (sourceOrder.length === 0) {
    return result;
  }

  const allColumnsBySource = new Map<
    MetricSourceId,
    Map<
      string,
      {
        column: Lib.ColumnMetadata;
        label: string;
        icon: IconName;
        tabType: DimensionTabType;
      }
    >
  >();

  for (const sourceId of sourceOrder) {
    const query = queriesBySourceId[sourceId];
    if (!query) {
      continue;
    }

    const columnsMap = new Map<
      string,
      {
        column: Lib.ColumnMetadata;
        label: string;
        icon: IconName;
        tabType: DimensionTabType;
      }
    >();
    const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

    for (const column of breakoutableCols) {
      if (!isDimensionColumn(column)) {
        continue;
      }

      const info = Lib.displayInfo(query, STAGE_INDEX, column);
      const columnName = info.name;

      if (existingTabIds.has(columnName)) {
        continue;
      }

      const tabType = getDimensionType(column);
      if (!tabType) {
        continue;
      }

      if (!columnsMap.has(columnName)) {
        columnsMap.set(columnName, {
          column,
          label: info.displayName ?? columnName,
          icon: getColumnIcon(column),
          tabType,
        });
      }
    }

    allColumnsBySource.set(sourceId, columnsMap);
  }

  const columnToSources = new Map<string, MetricSourceId[]>();
  const columnLabels = new Map<string, string>();
  const columnIcons = new Map<string, IconName>();
  const columnTabTypes = new Map<string, DimensionTabType>();

  for (const [sourceId, columns] of allColumnsBySource) {
    for (const [columnName, { label, icon, tabType }] of columns) {
      if (!columnToSources.has(columnName)) {
        columnToSources.set(columnName, []);
        columnLabels.set(columnName, label);
        columnIcons.set(columnName, icon);
        columnTabTypes.set(columnName, tabType);
      }
      columnToSources.get(columnName)!.push(sourceId);
    }
  }

  const loadedSourceCount = allColumnsBySource.size;
  const hasMultipleSources = loadedSourceCount > 1;

  const sharedColumnNames = new Set<string>();
  if (hasMultipleSources) {
    for (const [columnName, sourceIds] of columnToSources) {
      if (sourceIds.length === loadedSourceCount) {
        sharedColumnNames.add(columnName);
        result.shared.push({
          columnName,
          label: columnLabels.get(columnName)!,
          icon: columnIcons.get(columnName)!,
          sourceIds,
          tabType: columnTabTypes.get(columnName)!,
        });
      }
    }
    result.shared.sort((a, b) => a.label.localeCompare(b.label));
  }

  for (const sourceId of sourceOrder) {
    const columns = allColumnsBySource.get(sourceId);
    if (!columns) {
      continue;
    }

    result.bySource[sourceId] = [];

    for (const [columnName, { label, icon, tabType }] of columns) {
      if (!hasMultipleSources || !sharedColumnNames.has(columnName)) {
        result.bySource[sourceId].push({
          columnName,
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

export function getSourceDisplayName(
  sourceId: MetricSourceId,
  sourceDataById: Record<MetricSourceId, SourceData>,
): string {
  const sourceData = sourceDataById[sourceId];
  if (!sourceData) {
    return sourceId;
  }
  if (sourceData.type === "metric") {
    return sourceData.data.card.name;
  }
  return sourceData.data.measure.name;
}
