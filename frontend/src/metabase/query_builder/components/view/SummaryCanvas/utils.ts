import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { SummaryBase, SummaryDragItem } from "./types";

/**
 * The canvas a question's summaries live on: its own for a saved question, otherwise
 * one per source table (or card), shared by unsaved questions on it.
 */
export function getSummaryKey(question: Question): string | null {
  const questionId = question.id();
  if (questionId != null) {
    return `question:${questionId}`;
  }
  const sourceId = Lib.sourceTableOrCardId(question.query());
  return sourceId != null ? `source:${sourceId}` : null;
}

/** The saved question's name, or the source table's name for ad-hoc questions. */
export function getDataLabel(question: Question): string {
  const query = question.query();
  const sourceId = Lib.sourceTableOrCardId(query);
  const source =
    sourceId != null ? Lib.tableOrCardMetadata(query, sourceId) : null;
  return (
    question.displayName() ??
    (source ? Lib.displayInfo(query, -1, source).displayName : t`Data`)
  );
}

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

/** Labels of the data tab's filters, which apply to every summary on the canvas. */
export function getSourceFilterLabels({
  query,
  stageIndex,
}: SummaryBase): string[] {
  return Lib.filters(query, stageIndex).map(
    (filter) => Lib.displayInfo(query, stageIndex, filter).displayName,
  );
}

/** Labels of the data tab's custom columns, which every summary can use. */
export function getSourceExpressionLabels({
  query,
  stageIndex,
}: SummaryBase): string[] {
  return Lib.expressions(query, stageIndex).map(
    (expression) => Lib.displayInfo(query, stageIndex, expression).displayName,
  );
}

export function getItemKey(
  base: SummaryBase,
  item: Lib.ColumnMetadata | Lib.MetricMetadata | Lib.MeasureMetadata,
): string {
  if (Lib.isMeasureMetadata(item)) {
    return `measure:${getMetricLabel(base, item)}`;
  }
  return JSON.stringify(Lib.legacyRef(base.query, base.stageIndex, item));
}

export function getColumnLabel(
  { query, stageIndex }: SummaryBase,
  column: Lib.ColumnMetadata,
): string {
  return Lib.displayInfo(query, stageIndex, column).displayName;
}

export function getMetricLabel(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata | Lib.MeasureMetadata,
): string {
  return Lib.isMetricMetadata(metric)
    ? Lib.displayInfo(query, stageIndex, metric).displayName
    : Lib.displayInfo(query, stageIndex, metric).displayName;
}

export function getMetricDescription(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata | Lib.MeasureMetadata,
): string | undefined {
  return Lib.isMetricMetadata(metric)
    ? Lib.displayInfo(query, stageIndex, metric).description
    : Lib.displayInfo(query, stageIndex, metric).description;
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

/** Saved metrics and measures defined on the same table, filtered by name. */
export function getAvailableMetrics(
  base: SummaryBase,
  searchText: string,
): (Lib.MetricMetadata | Lib.MeasureMetadata)[] {
  const normalizedSearchText = searchText.trim().toLowerCase();
  return [
    ...Lib.availableMetrics(base.query, base.stageIndex),
    ...Lib.availableMeasures(base.query, base.stageIndex),
  ].filter(
    (metric) =>
      normalizedSearchText.length === 0 ||
      getMetricLabel(base, metric).toLowerCase().includes(normalizedSearchText),
  );
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
