import type { SummaryTableSettings } from "metabase/meta/types/summary_table";
import type { ColumnName, DatasetData } from "metabase/meta/types/Dataset";
import { columnsAreValid } from "metabase/visualizations/lib/utils";
import get from "lodash.get";
import set from "lodash.set";
import sortBy from "lodash.sortby";
import { Set } from "immutable";
import { emptyColumnMetadata } from "metabase/visualizations/components/settings/ChartSettingsSummaryTableColumns";

export const AGGREGATION = "aggregation";
export const BREAKOUT = "breakout";

const emptyStateSerialized: SummaryTableSettings = {
  groupsSources: [],
  columnsSource: [],
  valuesSources: [],
  unusedColumns: [],
  columnNameToMetadata: {},
};

export const settingsAreValid = (
  settings: SummaryTableSettings,
  data: DatasetData,
) =>
  settings &&
  columnsAreValid(getColumnsFromSettings(settings), data) &&
  settings.columnsSource.length <= 1;

export const getColumnsFromSettings = (value: SummaryTableSettings) => [
  ...value.groupsSources,
  ...value.columnsSource,
  ...value.valuesSources,
];

export const canTotalizeByType = (type: string) =>
  type === "type/BigInteger" ||
  type === "type/Integer" ||
  type === "type/Float" ||
  type === "type/Number" ||
  type === "type/Decimal";

const canTotalizeBySpecialType = (specialType: string) => {
  return (
    !specialType || (specialType !== "type/PK" && specialType !== "type/FK")
  );
};

export const shouldTotalizeDefaultBuilder = (
  columns: Column[],
): (ColumnName => boolean) => {
  const aggrColumns =
    columns[0].source === "fields" ||
    !columns[0].source ||
    columns.filter(p => p.source !== BREAKOUT).length === 0
      ? columns
          .filter(p => canTotalizeBySpecialType(p.special_type))
          .filter(p => canTotalizeByType(p.base_type))
      : columns.filter(p => p.source === AGGREGATION);

  const aggregations = Set.of(...aggrColumns.map(p => p.name));
  return name => aggregations.has(name);
};

const getMetadataBuilder = (columnNameToMetadata, sortOverride) => {
  return columnName => {
    const metadata = columnNameToMetadata[columnName] || emptyColumnMetadata;
    const orderOverridden = sortOverride[columnName];
    if (
      orderOverridden &&
      orderOverridden !== (metadata.isAscSortOrder ? "asc" : "desc")
    )
      return { ...metadata, isAscSortOrder: !metadata.isAscSortOrder };

    return metadata;
  };
};

const enrichColumns = (
  { columnsSource, groupsSources, valuesSources, unusedColumns },
  cols,
  columns,
) => {
  const usedColumns = Set.of(
    ...columnsSource,
    ...groupsSources,
    ...valuesSources,
    ...unusedColumns,
  );
  const newColumns = columns.filter(p => !usedColumns.has(p));
  const unusedColumnsNew = unusedColumns.filter(p => columns.includes(p));

  const shouldTotal = shouldTotalizeDefaultBuilder(cols);

  const groupsSourcesNew = newColumns.filter(p => !shouldTotal(p));
  const valuesSourcesNew = newColumns.filter(shouldTotal);

  return {
    groupsSources: [...groupsSources, ...groupsSourcesNew],
    columnsSource,
    valuesSources: [...valuesSources, ...valuesSourcesNew],
    unusedColumns: unusedColumnsNew,
  };
};

const enrichMetadata = (
  { groupsSources, columnsSource },
  columnNameToMetadata,
  sortOverride,
) => {
  const fatColumns = [...groupsSources, ...columnsSource];
  const getMetadata = getMetadataBuilder(columnNameToMetadata, sortOverride);
  return fatColumns.reduce(
    (acc, column) => ({
      ...acc,
      [column]: getMetadata(column),
    }),
    {},
  );
};

const getWeight = (column: Column) =>
  get(
    column,
    ["fingerprint", "global", "distinct-count"],
    Number.MAX_SAFE_INTEGER,
  );

const getRawColumns = (cols, columns) => {
  const names = Set.of(...cols.map(p => p.name));
  const weights = cols.reduce(
    (acc, column) => set(acc, column.name, getWeight(column)),
    {},
  );
  return sortBy(
    columns.filter(col => names.contains(col)),
    columnName => weights[columnName],
  );
};

export const enrichSettings = (
  stateSerialized,
  cols,
  columns,
  sortOverride = {},
): SummaryTableSettings => {
  const rawColumns = getRawColumns(cols, columns);
  const stateNormalized = { ...emptyStateSerialized, ...stateSerialized };

  const partColumns = enrichColumns(stateNormalized, cols, rawColumns);
  const columnNameToMetadata = enrichMetadata(
    partColumns,
    stateNormalized.columnNameToMetadata,
    sortOverride,
  );
  return { ...partColumns, columnNameToMetadata };
};
