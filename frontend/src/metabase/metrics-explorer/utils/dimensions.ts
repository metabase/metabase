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

const STAGE_INDEX = -1;

/**
 * Tab type configuration - declarative definition of each dimension tab type.
 * Priority determines default tab ordering (lower = higher priority).
 */
interface TabTypeConfig {
  type: DimensionTabType;
  id: string | null;
  label: string | null;
  priority: number;
  /** If true, tab shows if ANY source has matching columns (vs ALL sources) */
  showIfAnySource: boolean;
}

const TAB_TYPE_CONFIGS: TabTypeConfig[] = [
  { type: "time", id: "time", label: "Time", priority: 0, showIfAnySource: true },
  {
    type: "geo",
    id: "geo",
    label: "Location",
    priority: 1,
    showIfAnySource: true,
  },
  {
    type: "boolean",
    id: null,
    label: null,
    priority: 2,
    showIfAnySource: false,
  },
  {
    type: "category",
    id: null,
    label: null,
    priority: 3,
    showIfAnySource: false,
  },
];

/**
 * Geo column subtypes for prioritization within geo columns.
 * When selecting which geo column to use, prefer country > state > city > other.
 */
const GEO_SUBTYPE_PRIORITY: Record<string, number> = {
  country: 0,
  state: 1,
  city: 2,
  zipCode: 3,
};

// ============================================================
// COLUMN PREDICATES
// ============================================================

type ColumnPredicate = (column: Lib.ColumnMetadata) => boolean;

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: string;
  predicate: ColumnPredicate;
}> = [
  { subtype: "country", predicate: Lib.isCountry },
  { subtype: "state", predicate: Lib.isState },
  { subtype: "city", predicate: Lib.isCity },
  { subtype: "zipCode", predicate: Lib.isZipCode },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Get the geo subtype for prioritization */
function getGeoSubtype(column: Lib.ColumnMetadata): string {
  for (const { subtype, predicate } of GEO_SUBTYPE_PREDICATES) {
    if (predicate(column)) {
      return subtype;
    }
  }
  return "other";
}

/** Get geo priority (lower = higher priority) */
function getGeoPriority(column: Lib.ColumnMetadata): number {
  const subtype = getGeoSubtype(column);
  return GEO_SUBTYPE_PRIORITY[subtype] ?? 999;
}

/**
 * Check if a column is a geographic type suitable for region maps.
 * Explicitly excludes latitude/longitude coordinates which require pin maps.
 */
export function isGeoColumn(column: Lib.ColumnMetadata): boolean {
  // Exclude coordinates (latitude/longitude) - they need pin maps, not region maps
  if (Lib.isCoordinate(column) || Lib.isLatitude(column) || Lib.isLongitude(column)) {
    return false;
  }

  // Include region-based geographic types
  return (
    Lib.isState(column) ||
    Lib.isCountry(column) ||
    Lib.isCity(column) ||
    Lib.isZipCode(column)
  );
}

/**
 * Determine the map region type based on a geographic column.
 * Returns "us_states" for US state columns, "world_countries" for country columns.
 */
export function getMapRegionForColumn(column: Lib.ColumnMetadata): string | null {
  if (Lib.isState(column)) {
    return "us_states";
  }
  if (Lib.isCountry(column)) {
    return "world_countries";
  }
  // For city/zip, we could potentially support custom GeoJSON in the future
  // For now, fallback to us_states as it's more commonly available
  if (Lib.isCity(column) || Lib.isZipCode(column)) {
    return "us_states";
  }
  return null;
}

/**
 * Categorize a column by its dimension type.
 * Returns null for columns that shouldn't be used as dimension tabs.
 */
export function getDimensionType(
  column: Lib.ColumnMetadata,
): DimensionTabType | null {
  // Time dimension: date or datetime columns
  if (Lib.isDateOrDateTime(column)) {
    return "time";
  }

  // Geo dimension: geographic columns
  if (isGeoColumn(column)) {
    return "geo";
  }

  // Boolean dimension
  if (Lib.isBoolean(column)) {
    return "boolean";
  }

  // Skip primary keys, foreign keys, and URLs - they don't make good grouping dimensions
  if (Lib.isPrimaryKey(column) || Lib.isForeignKey(column) || Lib.isURL(column)) {
    return null;
  }

  if (Lib.isCategory(column)) {
    return "category";
  }

  // Numeric dimension: can be binned
  if (Lib.isNumeric(column)) {
    return "numeric";
  }

  return null;
}

/**
 * Column info with name and type for grouping.
 */
interface ColumnInfo {
  column: Lib.ColumnMetadata;
  name: string;
  type: DimensionTabType;
}

/**
 * Get all breakoutable columns from a query, grouped by name and type.
 */
export function getBreakoutColumnsByType(
  query: Lib.Query,
): Map<string, ColumnInfo> {
  const result = new Map<string, ColumnInfo>();
  const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

  for (const column of breakoutableCols) {
    const type = getDimensionType(column);
    if (type === null) {
      continue;
    }

    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    const name = info.name;

    // Use the first column we find for each name
    if (!result.has(name)) {
      result.set(name, { column, name, type });
    }
  }

  return result;
}

/**
 * Format a column name from snake_case to Title Case.
 */
export function formatColumnLabel(columnName: string): string {
  return columnName
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Classify columns by source - returns a map of sourceId to columns grouped by type.
 */
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

/**
 * Find a column by name from breakoutable columns and apply default bucketing if needed.
 */
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

/**
 * Compute default tabs when first source loads.
 * Creates Time and Location tabs if columns are available.
 */
export function computeDefaultTabs(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): StoredDimensionTab[] {
  const tabs: StoredDimensionTab[] = [];

  if (sourceOrder.length === 0) {
    return tabs;
  }

  const columnsBySource = classifyColumnsBySource(queriesBySourceId, sourceOrder);
  if (columnsBySource.size === 0) {
    return tabs;
  }

  for (const config of TAB_TYPE_CONFIGS) {
    if (!config.showIfAnySource || config.id === null || config.label === null) {
      continue;
    }

    const columnsBySourceRecord: Record<MetricSourceId, string> = {};

    for (const sourceId of sourceOrder) {
      const columns = columnsBySource.get(sourceId);
      if (!columns) {
        continue;
      }

      let bestColumn: ColumnInfo | null = null;
      let bestPriority = Infinity;

      for (const [, info] of columns) {
        if (info.type === config.type) {
          if (config.type === "geo") {
            const priority = getGeoPriority(info.column);
            if (priority < bestPriority) {
              bestPriority = priority;
              bestColumn = info;
            }
          } else {
            bestColumn = info;
            break;
          }
        }
      }

      if (bestColumn) {
        columnsBySourceRecord[sourceId] = bestColumn.name;
      }
    }

    if (Object.keys(columnsBySourceRecord).length > 0) {
      tabs.push({
        id: config.id,
        type: config.type,
        label: config.label,
        columnsBySource: columnsBySourceRecord,
      });
    }
  }

  return tabs;
}

/**
 * Create a stored tab from a column name.
 * Looks up the column in all sources to build the columnsBySource mapping.
 */
export function createTabFromColumn(
  columnName: string,
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): StoredDimensionTab | null {
  const columnsBySourceRecord: Record<MetricSourceId, string> = {};
  let tabType: DimensionTabType = "category";

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
    }
  }

  if (Object.keys(columnsBySourceRecord).length === 0) {
    return null;
  }

  return {
    id: columnName,
    type: tabType,
    label: formatColumnLabel(columnName),
    columnsBySource: columnsBySourceRecord,
  };
}

/**
 * Find matching column for a tab type in a query.
 * Returns the column name if found, null otherwise.
 */
export function findMatchingColumnForTab(
  query: Lib.Query,
  tab: StoredDimensionTab,
): string | null {
  const columnsByType = getBreakoutColumnsByType(query);

  // For aggregate tabs (time, geo), find best column of that type
  if (tab.type === "time" || tab.type === "geo") {
    let bestColumn: ColumnInfo | null = null;
    let bestPriority = Infinity;

    for (const [, info] of columnsByType) {
      if (info.type === tab.type) {
        if (tab.type === "geo") {
          const priority = getGeoPriority(info.column);
          if (priority < bestPriority) {
            bestPriority = priority;
            bestColumn = info;
          }
        } else {
          bestColumn = info;
          break;
        }
      }
    }

    return bestColumn?.name ?? null;
  }

  // For column-specific tabs, look for exact column name match
  const matchingColumn = columnsByType.get(tab.id);
  if (matchingColumn && matchingColumn.type === tab.type) {
    return matchingColumn.name;
  }

  return null;
}

/**
 * Hydrate a stored tab with actual column metadata.
 * Converts column names to Lib.ColumnMetadata by looking them up in queries.
 */
export function hydrateTabColumns(
  storedTab: StoredDimensionTab,
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
): DimensionTab {
  const columnsBySource: DimensionTabColumn[] = [];

  for (const [sourceId, columnName] of Object.entries(storedTab.columnsBySource)) {
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
  };
}


// ============================================================
// AVAILABLE COLUMNS FOR PICKER
// ============================================================

/**
 * Column available for selection in the "+" picker menu.
 */
export interface AvailableColumn {
  columnName: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: DimensionTabType;
}

/**
 * Result of getting available columns, grouped by source with shared columns.
 */
export interface AvailableColumnsResult {
  shared: AvailableColumn[];
  bySource: Record<MetricSourceId, AvailableColumn[]>;
}

/**
 * Get all available columns for the "+" picker menu.
 * Returns columns grouped by source, with "shared" columns that exist in ALL sources listed first.
 */
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

  // Get all breakoutable columns from each source
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
      const info = Lib.displayInfo(query, STAGE_INDEX, column);
      const columnName = info.name;

      // Skip columns that already exist as tabs
      if (existingTabIds.has(columnName)) {
        continue;
      }

      // Skip primary/foreign keys and URLs - they don't make good dimensions
      if (
        Lib.isPrimaryKey(column) ||
        Lib.isForeignKey(column) ||
        Lib.isURL(column)
      ) {
        continue;
      }

      // Get dimension type for this column
      const tabType = getDimensionType(column) ?? "category";

      if (!columnsMap.has(columnName)) {
        columnsMap.set(columnName, {
          column,
          label: info.displayName ?? formatColumnLabel(columnName),
          icon: getColumnIcon(column),
          tabType,
        });
      }
    }

    allColumnsBySource.set(sourceId, columnsMap);
  }

  // Build column-to-sources map for deduplication
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

  // Identify shared columns (present in ALL sources)
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

  // Build per-source columns (excluding shared)
  for (const sourceId of sourceOrder) {
    const columns = allColumnsBySource.get(sourceId);
    if (!columns) {
      continue;
    }

    result.bySource[sourceId] = [];

    for (const [columnName, { label, icon, tabType }] of columns) {
      // For single source, include all columns
      // For multiple sources, exclude shared columns from per-source lists
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

/**
 * Get the display name for a source (metric or measure name).
 */
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
