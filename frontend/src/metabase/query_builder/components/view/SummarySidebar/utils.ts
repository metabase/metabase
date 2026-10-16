import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type { PivotTableColumnSplitSetting } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDimensionWellId,
  SummaryDragItem,
  SummaryValue,
  SummaryWellId,
} from "./types";

export function getSummaryBase(dataQuery: Lib.Query): SummaryBase {
  const stageIndex = -1;
  const isAggregated =
    Lib.aggregations(dataQuery, stageIndex).length > 0 ||
    Lib.breakouts(dataQuery, stageIndex).length > 0;
  if (isAggregated) {
    return { query: Lib.appendStage(dataQuery), stageIndex };
  }

  // sorting, limits, and hidden columns only make sense for raw rows; keep filters and joins
  const withoutOrderBys = Lib.removeOrderBys(dataQuery, stageIndex);
  const withoutLimit = Lib.limit(withoutOrderBys, stageIndex, null);
  return {
    query: Lib.withFields(withoutLimit, stageIndex, []),
    stageIndex,
  };
}

export function getItemKey(
  { query, stageIndex }: SummaryBase,
  item: Lib.ColumnMetadata | Lib.MetricMetadata,
): string {
  return JSON.stringify(Lib.legacyRef(query, stageIndex, item));
}

export function getColumnLabel(
  { query, stageIndex }: SummaryBase,
  column: Lib.ColumnMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, column).displayName;
}

export function getMetricLabel(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, metric).displayName;
}

export type SummaryColumnSection = {
  name: string;
  columns: Lib.ColumnMetadata[];
};

export function getColumnSections(
  base: SummaryBase,
  searchText: string,
): SummaryColumnSection[] {
  const { query, stageIndex } = base;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const columns = Lib.breakoutableColumns(query, stageIndex).filter(
    (column) =>
      normalizedSearchText.length === 0 ||
      getColumnLabel(base, column).toLowerCase().includes(normalizedSearchText),
  );

  return Lib.groupColumns(columns).map((group) => ({
    name: Lib.displayInfo(query, stageIndex, group).displayName,
    columns: Lib.getColumnsFromColumnGroup(group),
  }));
}

export function getAvailableMetrics(
  base: SummaryBase,
  searchText: string,
): Lib.MetricMetadata[] {
  const normalizedSearchText = searchText.trim().toLowerCase();
  return Lib.availableMetrics(base.query, base.stageIndex).filter(
    (metric) =>
      normalizedSearchText.length === 0 ||
      getMetricLabel(base, metric).toLowerCase().includes(normalizedSearchText),
  );
}

function findOperator(
  { query, stageIndex }: SummaryBase,
  shortName: string,
): Lib.AggregationOperator | undefined {
  return Lib.availableAggregationOperators(query, stageIndex).find(
    (operator) =>
      Lib.displayInfo(query, stageIndex, operator).shortName === shortName,
  );
}

function findOperatorColumn(
  base: SummaryBase,
  operator: Lib.AggregationOperator,
  column: Lib.ColumnMetadata,
): Lib.ColumnMetadata | null {
  return Lib.findMatchingColumn(
    base.query,
    base.stageIndex,
    column,
    Lib.aggregationOperatorColumns(operator),
  );
}

export type SummaryOperatorOption = {
  shortName: string;
  displayName: string;
};

/** Aggregation operators that can be applied to `column`, e.g. "Sum of ..." for numbers. */
export function getColumnOperatorOptions(
  base: SummaryBase,
  column: Lib.ColumnMetadata,
): SummaryOperatorOption[] {
  const { query, stageIndex } = base;
  return Lib.availableAggregationOperators(query, stageIndex)
    .map((operator) => ({
      operator,
      info: Lib.displayInfo(query, stageIndex, operator),
    }))
    .filter(
      ({ operator, info }) =>
        info.requiresColumn &&
        findOperatorColumn(base, operator, column) != null,
    )
    .map(({ info }) => ({
      shortName: info.shortName,
      displayName: info.displayName,
    }));
}

function getDefaultOperatorShortName(
  base: SummaryBase,
  column: Lib.ColumnMetadata,
): string | null {
  const shortNames = getColumnOperatorOptions(base, column).map(
    (option) => option.shortName,
  );
  return (
    ["sum", "distinct"].find((shortName) => shortNames.includes(shortName)) ??
    shortNames[0] ??
    null
  );
}

function getAggregable(
  base: SummaryBase,
  value: SummaryValue,
): Lib.Aggregable | null {
  switch (value.type) {
    case "count": {
      const operator = findOperator(base, "count");
      return operator ? Lib.aggregationClause(operator) : null;
    }
    case "column": {
      const operator = findOperator(base, value.operatorShortName);
      const column = operator
        ? findOperatorColumn(base, operator, value.column)
        : null;
      return operator && column
        ? Lib.aggregationClause(operator, column)
        : null;
    }
    case "metric": {
      const metricKey = getItemKey(base, value.metric);
      return (
        Lib.availableMetrics(base.query, base.stageIndex).find(
          (metric) => getItemKey(base, metric) === metricKey,
        ) ?? null
      );
    }
  }
}

/**
 * Builds the summary query: rows then columns as breakouts, values as aggregations, in well order.
 * Returns `null` when an item no longer resolves against the base query (e.g. a removed join).
 */
export function buildSummaryQuery(
  base: SummaryBase,
  definition: SummaryDefinition,
): Lib.Query | null {
  const { stageIndex } = base;
  const breakoutableColumns = Lib.breakoutableColumns(base.query, stageIndex);
  let query = base.query;

  for (const dimension of [...definition.rows, ...definition.columns]) {
    const column = Lib.findMatchingColumn(
      base.query,
      stageIndex,
      dimension.column,
      breakoutableColumns,
    );
    if (column == null) {
      return null;
    }
    query = Lib.breakout(
      query,
      stageIndex,
      withDimensionBucket(query, stageIndex, column, dimension.column),
    );
  }

  for (const value of definition.values) {
    const aggregable = getAggregable(base, value);
    if (aggregable == null) {
      return null;
    }
    query = Lib.aggregate(query, stageIndex, aggregable);
  }

  return query;
}

/** Keeps the temporal unit or binning a dimension came with (e.g. from an existing breakout), else the default. */
function withDimensionBucket(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  dimensionColumn: Lib.ColumnMetadata,
): Lib.ColumnMetadata {
  const temporalBucket = Lib.temporalBucket(dimensionColumn);
  if (temporalBucket != null) {
    return Lib.withTemporalBucket(column, temporalBucket);
  }
  const binning = Lib.binning(dimensionColumn);
  if (binning != null) {
    return Lib.withBinning(column, binning);
  }
  return Lib.withDefaultBucket(query, stageIndex, column);
}

function getFallbackValueLabel(base: SummaryBase, value: SummaryValue) {
  switch (value.type) {
    case "count":
      return t`Count of rows`;
    case "column":
      return getColumnLabel(base, value.column);
    case "metric":
      return getMetricLabel(base, value.metric);
  }
}

/**
 * Chip labels keyed by item id. Labels come from the built summary query when it resolves, so
 * they include default buckets ("Created At: Month") and aggregation names ("Sum of Total").
 */
export function getItemLabels(
  base: SummaryBase,
  definition: SummaryDefinition,
  summaryQuery: Lib.Query | null,
): Map<string, string> {
  const { stageIndex } = base;
  const breakoutLabels = summaryQuery
    ? Lib.breakouts(summaryQuery, stageIndex).map(
        (breakout) =>
          Lib.displayInfo(summaryQuery, stageIndex, breakout).displayName,
      )
    : [];
  const aggregationLabels = summaryQuery
    ? Lib.aggregations(summaryQuery, stageIndex).map(
        (aggregation) =>
          Lib.displayInfo(summaryQuery, stageIndex, aggregation).displayName,
      )
    : [];

  const labels = new Map<string, string>();
  [...definition.rows, ...definition.columns].forEach((dimension, index) => {
    labels.set(
      dimension.id,
      breakoutLabels[index] ?? getColumnLabel(base, dimension.column),
    );
  });
  definition.values.forEach((value, index) => {
    labels.set(
      value.id,
      aggregationLabels[index] ?? getFallbackValueLabel(base, value),
    );
  });
  return labels;
}

export type SummaryPivotConfig = {
  columnSplit: PivotTableColumnSplitSetting;
  pivotRows: number[];
  pivotCols: number[];
};

export function getPivotConfig(
  summaryQuery: Lib.Query,
  stageIndex: number,
  definition: SummaryDefinition,
): SummaryPivotConfig {
  const columnInfos = Lib.returnedColumns(summaryQuery, stageIndex).map(
    (column) => Lib.displayInfo(summaryQuery, stageIndex, column),
  );
  const breakoutNames = columnInfos
    .filter((info) => info.isBreakout)
    .map((info) => info.name);
  const aggregationNames = columnInfos
    .filter((info) => info.isAggregation)
    .map((info) => info.name);
  const rowCount = definition.rows.length;
  const dimensionCount = rowCount + definition.columns.length;

  return {
    columnSplit: {
      rows: breakoutNames.slice(0, rowCount),
      columns: breakoutNames.slice(rowCount, dimensionCount),
      values: aggregationNames,
    },
    pivotRows: _.range(0, rowCount),
    pivotCols: _.range(rowCount, dimensionCount),
  };
}

export function canDropOnWell(
  item: SummaryDragItem,
  wellId: SummaryWellId,
  definition: SummaryDefinition,
): boolean {
  switch (item.kind) {
    case "column":
      return true;
    case "metric":
      return wellId === "values";
    case "chip": {
      if (item.wellId === wellId) {
        return false;
      }
      if (wellId === "values") {
        return true;
      }
      const value = definition.values.find(({ id }) => id === item.itemId);
      return value == null || value.type === "column";
    }
  }
}

export function createItemId() {
  return _.uniqueId("summary-item-");
}

function withoutDimensionColumn(
  base: SummaryBase,
  definition: SummaryDefinition,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  const columnKey = getItemKey(base, column);
  const isOtherColumn = (dimension: SummaryDimension) =>
    getItemKey(base, dimension.column) !== columnKey;
  return {
    ...definition,
    rows: definition.rows.filter(isOtherColumn),
    columns: definition.columns.filter(isOtherColumn),
  };
}

function addDimension(
  base: SummaryBase,
  definition: SummaryDefinition,
  wellId: SummaryDimensionWellId,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  // a column can only group the pivot once, so dropping it moves it
  const nextDefinition = withoutDimensionColumn(base, definition, column);
  return {
    ...nextDefinition,
    [wellId]: [...nextDefinition[wellId], { id: createItemId(), column }],
  };
}

function addColumnValue(
  base: SummaryBase,
  definition: SummaryDefinition,
  column: Lib.ColumnMetadata,
): SummaryDefinition {
  const operatorShortName = getDefaultOperatorShortName(base, column);
  if (operatorShortName == null) {
    return definition;
  }
  return {
    ...definition,
    values: [
      ...definition.values,
      { id: createItemId(), type: "column", column, operatorShortName },
    ],
  };
}

export function addMetricValue(
  base: SummaryBase,
  definition: SummaryDefinition,
  metric: Lib.MetricMetadata,
): SummaryDefinition {
  const metricKey = getItemKey(base, metric);
  const hasMetric = definition.values.some(
    (value) =>
      value.type === "metric" && getItemKey(base, value.metric) === metricKey,
  );
  if (hasMetric) {
    return definition;
  }
  return {
    ...definition,
    values: [
      ...definition.values,
      { id: createItemId(), type: "metric", metric },
    ],
  };
}

export function addCountValue(
  definition: SummaryDefinition,
): SummaryDefinition {
  if (definition.values.some((value) => value.type === "count")) {
    return definition;
  }
  return {
    ...definition,
    values: [...definition.values, { id: createItemId(), type: "count" }],
  };
}

export function removeItem(
  definition: SummaryDefinition,
  itemId: string,
): SummaryDefinition {
  return {
    rows: definition.rows.filter(({ id }) => id !== itemId),
    columns: definition.columns.filter(({ id }) => id !== itemId),
    values: definition.values.filter(({ id }) => id !== itemId),
  };
}

export function changeValueOperator(
  definition: SummaryDefinition,
  itemId: string,
  operatorShortName: string,
): SummaryDefinition {
  return {
    ...definition,
    values: definition.values.map((value) =>
      value.id === itemId && value.type === "column"
        ? { ...value, operatorShortName }
        : value,
    ),
  };
}

function findChipColumn(
  definition: SummaryDefinition,
  itemId: string,
): Lib.ColumnMetadata | null {
  const dimension = [...definition.rows, ...definition.columns].find(
    ({ id }) => id === itemId,
  );
  if (dimension) {
    return dimension.column;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  return value?.type === "column" ? value.column : null;
}

/** Applies a drag-and-drop of `item` onto `wellId`; returns the definition unchanged for unsupported drops. */
export function dropOnWell(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryDragItem,
  wellId: SummaryWellId,
): SummaryDefinition {
  if (!canDropOnWell(item, wellId, definition)) {
    return definition;
  }

  switch (item.kind) {
    case "column":
      return wellId === "values"
        ? addColumnValue(base, definition, item.column)
        : addDimension(base, definition, wellId, item.column);
    case "metric":
      return addMetricValue(base, definition, item.metric);
    case "chip": {
      const column = findChipColumn(definition, item.itemId);
      if (column == null) {
        return definition;
      }
      const remainingDefinition = removeItem(definition, item.itemId);
      return wellId === "values"
        ? addColumnValue(base, remainingDefinition, column)
        : addDimension(base, remainingDefinition, wellId, column);
    }
  }
}

export function isSummaryDragItem(value: unknown): value is SummaryDragItem {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    (value.kind === "column" ||
      value.kind === "metric" ||
      value.kind === "chip")
  );
}
