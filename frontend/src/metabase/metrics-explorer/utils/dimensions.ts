import * as Lib from "metabase-lib";
import type {
  DimensionTab,
  DimensionTabColumn,
  DimensionTabType,
  MetricSourceId,
} from "metabase-types/store/metrics-explorer";

const STAGE_INDEX = -1;

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

  // Category dimension: categorical or string columns
  if (Lib.isCategory(column) || Lib.isString(column)) {
    return "category";
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
 * Find common dimension tabs across all sources.
 *
 * Rules:
 * - "Time" tab always appears first if any source has temporal columns
 * - "Geo" tab appears if any source has geographic columns
 * - Column-specific tabs (for category/boolean) only appear if:
 *   - 2+ sources exist AND
 *   - ALL sources have that exact column name
 * - Tabs are sorted: Time first, Geo second, then alphabetically by label
 */
export function findCommonDimensionTabs(
  queriesBySourceId: Record<MetricSourceId, Lib.Query | null>,
  sourceOrder: MetricSourceId[],
): DimensionTab[] {
  if (sourceOrder.length === 0) {
    return [];
  }

  // Get columns for each source
  const columnsBySource: Map<MetricSourceId, Map<string, ColumnInfo>> =
    new Map();

  for (const sourceId of sourceOrder) {
    const query = queriesBySourceId[sourceId];
    if (!query) {
      continue;
    }
    columnsBySource.set(sourceId, getBreakoutColumnsByType(query));
  }

  // No queries loaded yet
  if (columnsBySource.size === 0) {
    return [];
  }

  const loadedSourceIds = Array.from(columnsBySource.keys());
  const tabs: DimensionTab[] = [];

  // Check for Time dimension (any source having temporal columns)
  const timeColumnsBySource: DimensionTabColumn[] = [];
  for (const sourceId of loadedSourceIds) {
    const columns = columnsBySource.get(sourceId)!;
    for (const [name, info] of columns) {
      if (info.type === "time") {
        timeColumnsBySource.push({
          sourceId,
          column: info.column,
          columnName: name,
        });
        break; // Only need one time column per source
      }
    }
  }

  if (timeColumnsBySource.length > 0) {
    tabs.push({
      id: "time",
      type: "time",
      label: "Time",
      columnsBySource: timeColumnsBySource,
    });
  }

  // Check for Geo dimension (any source having geographic columns)
  const geoColumnsBySource: DimensionTabColumn[] = [];
  for (const sourceId of loadedSourceIds) {
    const columns = columnsBySource.get(sourceId)!;
    for (const [name, info] of columns) {
      if (info.type === "geo") {
        geoColumnsBySource.push({
          sourceId,
          column: info.column,
          columnName: name,
        });
        break; // Only need one geo column per source
      }
    }
  }

  if (geoColumnsBySource.length > 0) {
    tabs.push({
      id: "geo",
      type: "geo",
      label: "Location",
      columnsBySource: geoColumnsBySource,
    });
  }

  // Column-specific tabs: only if 2+ sources AND column exists in ALL sources
  if (loadedSourceIds.length >= 2) {
    const firstSourceColumns = columnsBySource.get(loadedSourceIds[0]);
    if (firstSourceColumns) {
      for (const [columnName, firstInfo] of firstSourceColumns) {
        // Skip time and geo - they have their own category tabs
        if (firstInfo.type === "time" || firstInfo.type === "geo") {
          continue;
        }

        // Check if this column exists in ALL other sources with the same type
        let isCommon = true;
        const columnsBySourceList: DimensionTabColumn[] = [
          {
            sourceId: loadedSourceIds[0],
            column: firstInfo.column,
            columnName,
          },
        ];

        for (let i = 1; i < loadedSourceIds.length; i++) {
          const sourceId = loadedSourceIds[i];
          const sourceColumns = columnsBySource.get(sourceId)!;
          const matchingColumn = sourceColumns.get(columnName);

          if (!matchingColumn || matchingColumn.type !== firstInfo.type) {
            isCommon = false;
            break;
          }

          columnsBySourceList.push({
            sourceId,
            column: matchingColumn.column,
            columnName,
          });
        }

        if (isCommon) {
          tabs.push({
            id: columnName,
            type: firstInfo.type,
            label: formatColumnLabel(columnName),
            columnsBySource: columnsBySourceList,
          });
        }
      }
    }
  }

  // Sort tabs: Time first, Geo second, then alphabetically by label
  tabs.sort((a, b) => {
    if (a.id === "time") {
      return -1;
    }
    if (b.id === "time") {
      return 1;
    }
    if (a.id === "geo") {
      return -1;
    }
    if (b.id === "geo") {
      return 1;
    }
    return a.label.localeCompare(b.label);
  });

  return tabs;
}
