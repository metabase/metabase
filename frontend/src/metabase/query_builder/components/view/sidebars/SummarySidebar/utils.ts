import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import type {
  SummaryDimensionItem,
  SummaryField,
  SummaryFieldItem,
  SummaryFieldSection,
  SummaryOperatorOption,
  SummaryValueItem,
  SummaryWellId,
} from "./types";

const DEFAULT_OPERATOR_SHORT_NAMES = ["sum", "distinct"];

function getMeasureItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldItem[] {
  return Lib.availableMeasures(query, stageIndex).map((measure) => {
    const { name, displayName } = Lib.displayInfo(query, stageIndex, measure);
    return {
      key: name,
      name: displayName,
      icon: "ruler",
      field: { kind: "measure", measure },
    };
  });
}

function getMetricItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldItem[] {
  return Lib.availableMetrics(query, stageIndex).map((metric) => {
    const { name, displayName } = Lib.displayInfo(query, stageIndex, metric);
    return {
      key: name,
      name: displayName,
      icon: "metric",
      field: { kind: "metric", metric },
    };
  });
}

function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  return Lib.groupColumns(columns).map((group, groupIndex) => {
    const { displayName } = Lib.displayInfo(query, stageIndex, group);
    const items = Lib.getColumnsFromColumnGroup(group).map(
      (column): SummaryFieldItem => {
        const { name, displayName } = Lib.displayInfo(
          query,
          stageIndex,
          column,
        );
        return {
          key: name,
          name: displayName,
          icon: getColumnIcon(column),
          field: { kind: "column", column },
        };
      },
    );
    return { key: `table-${groupIndex}`, name: displayName, items };
  });
}

function withoutEmptySections(sections: SummaryFieldSection[]) {
  return sections.filter((section) => section.items.length > 0);
}

/**
 * The fields the summary can be built from, in sections: the measures and metrics of the
 * query's source, then the breakoutable columns grouped by the table they come from, in the
 * order the query reaches those tables. Sections with no items are left out.
 */
export function getFieldSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  return withoutEmptySections([
    {
      key: "measures",
      name: t`Measures`,
      items: getMeasureItems(query, stageIndex),
    },
    {
      key: "metrics",
      name: t`Metrics`,
      items: getMetricItems(query, stageIndex),
    },
    ...getColumnSections(query, stageIndex),
  ]);
}

/**
 * The sections a well's typeahead offers. Group by offers the table sections. Summarize by offers
 * Count of rows, then measures and metrics, then the table sections: a column picked there is
 * aggregated with its default operator.
 */
export function getWellFieldSections(
  sections: SummaryFieldSection[],
  wellId: SummaryWellId,
): SummaryFieldSection[] {
  const isValueSection = (section: SummaryFieldSection) =>
    section.key === "measures" || section.key === "metrics";
  if (wellId === "columns") {
    return sections.filter((section) => !isValueSection(section));
  }
  return [
    {
      key: "count",
      name: t`Basic`,
      items: [
        {
          key: "count",
          name: t`Count of rows`,
          icon: "sum",
          field: { kind: "count" },
        },
      ],
    },
    ...sections.filter(isValueSection),
    ...sections.filter((section) => !isValueSection(section)),
  ];
}

/**
 * The sections with only the items whose names contain `searchText`, ignoring case and
 * surrounding whitespace; sections left with no items are dropped. Returns `sections` itself
 * for a blank search.
 */
export function filterFieldSections(
  sections: SummaryFieldSection[],
  searchText: string,
): SummaryFieldSection[] {
  const needle = searchText.trim().toLowerCase();
  if (needle.length === 0) {
    return sections;
  }
  return withoutEmptySections(
    sections.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.name.toLowerCase().includes(needle),
      ),
    })),
  );
}

function findOperatorColumn(
  query: Lib.Query,
  stageIndex: number,
  operator: Lib.AggregationOperator,
  column: Lib.ColumnMetadata,
): Lib.ColumnMetadata | null {
  return Lib.findMatchingColumn(
    query,
    stageIndex,
    column,
    Lib.aggregationOperatorColumns(operator),
  );
}

/** The operators among `operators` that can aggregate `column`, e.g. Sum and Average for a number. */
function getColumnOperatorOptions(
  query: Lib.Query,
  stageIndex: number,
  operators: Lib.AggregationOperator[],
  column: Lib.ColumnMetadata,
): SummaryOperatorOption[] {
  return operators
    .map((operator) => ({
      operator,
      info: Lib.displayInfo(query, stageIndex, operator),
    }))
    .filter(
      ({ operator, info }) =>
        info.requiresColumn &&
        findOperatorColumn(query, stageIndex, operator, column) != null,
    )
    .map(({ operator, info }) => ({
      operator,
      shortName: info.shortName,
      displayName: info.displayName,
      isSelected: info.selected === true,
    }));
}

/** The operators a column value can switch to, with the one it uses selected. */
export function getValueOperatorOptions(
  query: Lib.Query,
  stageIndex: number,
  item: Extract<SummaryValueItem, { kind: "column" }>,
): SummaryOperatorOption[] {
  return getColumnOperatorOptions(
    query,
    stageIndex,
    Lib.selectedAggregationOperators(
      Lib.availableAggregationOperators(query, stageIndex),
      item.clause,
    ),
    item.column,
  );
}

/** Sum when the column can be summed, else Distinct values, else the first operator that fits. */
function getDefaultOperatorOption(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): SummaryOperatorOption | null {
  const options = getColumnOperatorOptions(
    query,
    stageIndex,
    Lib.availableAggregationOperators(query, stageIndex),
    column,
  );
  return (
    DEFAULT_OPERATOR_SHORT_NAMES.map((shortName) =>
      options.find((option) => option.shortName === shortName),
    ).find((option) => option != null) ??
    options[0] ??
    null
  );
}

function getColumnAggregation(
  query: Lib.Query,
  stageIndex: number,
  operator: Lib.AggregationOperator,
  column: Lib.ColumnMetadata,
): Lib.AggregationClause | null {
  const operatorColumn = findOperatorColumn(
    query,
    stageIndex,
    operator,
    column,
  );
  return operatorColumn
    ? Lib.aggregationClause(operator, operatorColumn)
    : null;
}

function getValueItem(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.AggregationClause,
  index: number,
): SummaryValueItem {
  const { displayName } = Lib.displayInfo(query, stageIndex, clause);
  const base = { clause, label: displayName };
  const operators = Lib.selectedAggregationOperators(
    Lib.availableAggregationOperators(query, stageIndex),
    clause,
  );
  const selectedOperator = operators.find(
    (operator) => Lib.displayInfo(query, stageIndex, operator).selected,
  );
  if (selectedOperator != null) {
    // the operator's columns carry the selection; `Lib.aggregationColumn` is the result column
    const column = Lib.aggregationOperatorColumns(selectedOperator).find(
      (column) => Lib.displayInfo(query, stageIndex, column).selected,
    );
    return column
      ? { ...base, kind: "column", column }
      : { ...base, kind: "count" };
  }
  const isMetric = Lib.availableMetrics(query, stageIndex).some(
    (metric) =>
      Lib.displayInfo(query, stageIndex, metric).aggregationPosition === index,
  );
  if (isMetric) {
    return { ...base, kind: "metric" };
  }
  const isMeasure = Lib.availableMeasures(query, stageIndex).some((measure) =>
    Lib.displayInfo(query, stageIndex, measure).aggregationPositions?.includes(
      index,
    ),
  );
  return { ...base, kind: isMeasure ? "measure" : "expression" };
}

/** The stage's aggregations as Summarize by chips. */
export function getValueItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryValueItem[] {
  return Lib.aggregations(query, stageIndex).map((clause, index) =>
    getValueItem(query, stageIndex, clause, index),
  );
}

/** The stage's breakouts as Group by chips, named with their bucket, e.g. "Created At: Month". */
export function getDimensionItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryDimensionItem[] {
  return Lib.breakouts(query, stageIndex).map((clause) => ({
    clause,
    label: Lib.displayInfo(query, stageIndex, clause).longDisplayName,
  }));
}

function hasBreakout(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): boolean {
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);
  return breakoutPositions.length > 0;
}

function getMetricKey(
  query: Lib.Query,
  stageIndex: number,
  metric: Lib.MetricMetadata,
): string {
  return JSON.stringify(Lib.legacyRef(query, stageIndex, metric));
}

// measures have no legacy ref; their names are unique within the source they come from
function getMeasureKey(
  query: Lib.Query,
  stageIndex: number,
  measure: Lib.MeasureMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, measure).name;
}

/**
 * Whether Summarize by already has `field`. A metric or measure from the field list carries no
 * position in this query, so it's looked up among the query's own.
 */
function hasValue(
  query: Lib.Query,
  stageIndex: number,
  field: Exclude<SummaryField, { kind: "column" }>,
): boolean {
  switch (field.kind) {
    case "count":
      return getValueItems(query, stageIndex).some(
        (item) => item.kind === "count",
      );
    case "metric": {
      const key = getMetricKey(query, stageIndex, field.metric);
      return Lib.availableMetrics(query, stageIndex).some(
        (metric) =>
          getMetricKey(query, stageIndex, metric) === key &&
          Lib.displayInfo(query, stageIndex, metric).aggregationPosition !=
            null,
      );
    }
    case "measure": {
      const key = getMeasureKey(query, stageIndex, field.measure);
      return Lib.availableMeasures(query, stageIndex).some((measure) => {
        const { aggregationPositions = [] } = Lib.displayInfo(
          query,
          stageIndex,
          measure,
        );
        return (
          getMeasureKey(query, stageIndex, measure) === key &&
          aggregationPositions.length > 0
        );
      });
    }
  }
}

/**
 * Adds `field` to a well: as a breakout in Group by, or as an aggregation in Summarize by, a
 * column with its default operator. Returns `query` itself when the well already has the field,
 * or when a column can't be aggregated. A column that can't be grouped is left to `Lib.breakout`.
 */
export function addField(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  field: SummaryField,
): Lib.Query {
  if (wellId === "columns") {
    if (
      field.kind !== "column" ||
      hasBreakout(query, stageIndex, field.column)
    ) {
      return query;
    }
    return Lib.breakout(
      query,
      stageIndex,
      Lib.withDefaultBucket(query, stageIndex, field.column),
    );
  }
  switch (field.kind) {
    case "column": {
      const option = getDefaultOperatorOption(query, stageIndex, field.column);
      const clause =
        option &&
        getColumnAggregation(query, stageIndex, option.operator, field.column);
      return clause ? Lib.aggregate(query, stageIndex, clause) : query;
    }
    case "count":
      return hasValue(query, stageIndex, field)
        ? query
        : Lib.aggregateByCount(query, stageIndex);
    case "metric":
      return hasValue(query, stageIndex, field)
        ? query
        : Lib.aggregate(query, stageIndex, field.metric);
    case "measure":
      return hasValue(query, stageIndex, field)
        ? query
        : Lib.aggregate(query, stageIndex, field.measure);
  }
}

/** Takes a chip off its well, dropping the clauses that depend on it too. */
export function removeItem(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.AggregationClause | Lib.BreakoutClause,
): Lib.Query {
  return Lib.removeClause(query, stageIndex, clause);
}

/** Empties a well, dropping the clauses that depend on its contents too. */
export function clearWell(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
): Lib.Query {
  const clauses =
    wellId === "values"
      ? Lib.aggregations(query, stageIndex)
      : Lib.breakouts(query, stageIndex);
  return clauses.reduce(
    (query, clause) => Lib.removeClause(query, stageIndex, clause),
    query,
  );
}

/** Puts `field` in a well in place of what it holds. */
export function replaceWellWithField(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  field: SummaryField,
): Lib.Query {
  return addField(
    clearWell(query, stageIndex, wellId),
    stageIndex,
    wellId,
    field,
  );
}

/** Aggregates a column value's column with another operator, in place. */
export function changeValueOperator(
  query: Lib.Query,
  stageIndex: number,
  item: Extract<SummaryValueItem, { kind: "column" }>,
  operator: Lib.AggregationOperator,
): Lib.Query {
  const clause = getColumnAggregation(query, stageIndex, operator, item.column);
  return clause
    ? Lib.replaceClause(query, stageIndex, item.clause, clause)
    : query;
}
