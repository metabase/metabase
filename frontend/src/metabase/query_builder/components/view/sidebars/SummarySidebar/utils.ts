import { t } from "ttag";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

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
const VALUE_SECTION_KEYS = ["measures", "metrics"];

function toFieldItem(
  { name, displayName }: { name: string; displayName: string },
  icon: IconName,
  field: SummaryField,
): SummaryFieldItem {
  return { key: name, name: displayName, icon, field };
}

function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  return Lib.groupColumns(columns).map((group, groupIndex) => ({
    key: `table-${groupIndex}`,
    name: Lib.displayInfo(query, stageIndex, group).displayName,
    items: Lib.getColumnsFromColumnGroup(group).map((column) =>
      toFieldItem(
        Lib.displayInfo(query, stageIndex, column),
        getColumnIcon(column),
        { kind: "column", column },
      ),
    ),
  }));
}

function withoutEmptySections(sections: SummaryFieldSection[]) {
  return sections.filter((section) => section.items.length > 0);
}

export function getFieldSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  return withoutEmptySections([
    {
      key: "measures",
      name: t`Measures`,
      items: Lib.availableMeasures(query, stageIndex).map((measure) =>
        toFieldItem(Lib.displayInfo(query, stageIndex, measure), "ruler", {
          kind: "measure",
          measure,
        }),
      ),
    },
    {
      key: "metrics",
      name: t`Metrics`,
      items: Lib.availableMetrics(query, stageIndex).map((metric) =>
        toFieldItem(Lib.displayInfo(query, stageIndex, metric), "metric", {
          kind: "metric",
          metric,
        }),
      ),
    },
    ...getColumnSections(query, stageIndex),
  ]);
}

export function getWellFieldSections(
  sections: SummaryFieldSection[],
  wellId: SummaryWellId,
): SummaryFieldSection[] {
  const [valueSections, columnSections] = _.partition(sections, (section) =>
    VALUE_SECTION_KEYS.includes(section.key),
  );
  if (wellId === "columns") {
    return columnSections;
  }
  const countSection: SummaryFieldSection = {
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
  };
  return [countSection, ...valueSections, ...columnSections];
}

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
  const preferredOptions = DEFAULT_OPERATOR_SHORT_NAMES.map((shortName) =>
    options.find((option) => option.shortName === shortName),
  );
  return [...preferredOptions, options[0]].find((option) => option) ?? null;
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

function getResultColumnNames(query: Lib.Query, stageIndex: number) {
  const infos = Lib.returnedColumns(query, stageIndex).map((column) =>
    Lib.displayInfo(query, stageIndex, column),
  );
  return {
    breakoutNames: infos.filter((info) => info.isBreakout).map((i) => i.name),
    aggregationNames: infos
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  };
}

function getValueItem(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.AggregationClause,
  key: string,
  operators: Lib.AggregationOperator[],
  entityKind: "metric" | "measure" | null,
): SummaryValueItem {
  const { displayName } = Lib.displayInfo(query, stageIndex, clause);
  const base = { clause, key, label: displayName };
  const clauseOperators = Lib.selectedAggregationOperators(operators, clause);
  const selectedOperator = clauseOperators.find(
    (operator) => Lib.displayInfo(query, stageIndex, operator).selected,
  );
  if (selectedOperator == null) {
    return { ...base, kind: entityKind ?? "expression" };
  }
  // the operator's columns carry the selection; `Lib.aggregationColumn` is the result column
  const column = Lib.aggregationOperatorColumns(selectedOperator).find(
    (column) => Lib.displayInfo(query, stageIndex, column).selected,
  );
  if (column == null) {
    return { ...base, kind: "count" };
  }
  return {
    ...base,
    kind: "column",
    column,
    operatorOptions: getColumnOperatorOptions(
      query,
      stageIndex,
      clauseOperators,
      column,
    ),
  };
}

export function getValueItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryValueItem[] {
  const operators = Lib.availableAggregationOperators(query, stageIndex);
  const metricPositions = new Set(
    Lib.availableMetrics(query, stageIndex).map(
      (metric) =>
        Lib.displayInfo(query, stageIndex, metric).aggregationPosition,
    ),
  );
  const measurePositions = new Set(
    Lib.availableMeasures(query, stageIndex).flatMap(
      (measure) =>
        Lib.displayInfo(query, stageIndex, measure).aggregationPositions ?? [],
    ),
  );
  const getEntityKind = (index: number) => {
    if (metricPositions.has(index)) {
      return "metric";
    }
    return measurePositions.has(index) ? "measure" : null;
  };
  const { aggregationNames } = getResultColumnNames(query, stageIndex);
  return Lib.aggregations(query, stageIndex).map((clause, index) =>
    getValueItem(
      query,
      stageIndex,
      clause,
      aggregationNames[index],
      operators,
      getEntityKind(index),
    ),
  );
}

export function getDimensionItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryDimensionItem[] {
  const { breakoutNames } = getResultColumnNames(query, stageIndex);
  return Lib.breakouts(query, stageIndex).map((clause, index) => ({
    clause,
    key: breakoutNames[index],
    label: Lib.displayInfo(query, stageIndex, clause).longDisplayName,
  }));
}

function findBreakoutableColumn(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Lib.ColumnMetadata | null {
  return Lib.findMatchingColumn(
    query,
    stageIndex,
    column,
    Lib.breakoutableColumns(query, stageIndex),
  );
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

function getMeasureKey(
  query: Lib.Query,
  stageIndex: number,
  measure: Lib.MeasureMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, measure).name;
}

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

export function areQueriesEqual(query: Lib.Query, other: Lib.Query): boolean {
  return (
    query === other ||
    Lib.areLegacyQueriesEqual(
      Lib.toLegacyQuery(query),
      Lib.toLegacyQuery(other),
    )
  );
}

export function addField(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  field: SummaryField,
): Lib.Query {
  if (wellId === "columns") {
    const column =
      field.kind === "column"
        ? findBreakoutableColumn(query, stageIndex, field.column)
        : null;
    if (column == null || hasBreakout(query, stageIndex, column)) {
      return query;
    }
    return Lib.breakout(
      query,
      stageIndex,
      Lib.withDefaultBucket(query, stageIndex, column),
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
