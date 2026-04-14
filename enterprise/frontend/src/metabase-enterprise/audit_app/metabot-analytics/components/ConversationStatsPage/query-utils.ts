import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";

export type UsageStatsMetric = "conversations" | "messages" | "tokens";

/**
 * Case-insensitive column lookup — handles H2 uppercasing vs Postgres lowercase.
 */
export function findColumn(
  query: Query,
  name: string,
  columnsFn: (q: Query, stageIndex: number) => ColumnMetadata[],
): ColumnMetadata | undefined {
  const columns = columnsFn(query, 0);
  const lowerName = name.toLowerCase();
  return columns.find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name?.toLowerCase() === lowerName;
  });
}

/**
 * Apply a DatePickerValue filter to a date column on the query.
 * Uses the same filter clause generation as Metabase's standard date picker.
 */
export function applyDateFilter(
  query: Query,
  dateFilter: DateFilterValue,
  columnName = "created_at",
): Query {
  const dateCol = findColumn(query, columnName, Lib.filterableColumns);
  if (!dateCol) {
    return query;
  }

  const clause = getDateFilterClause(dateCol, dateFilter);
  return Lib.filter(query, 0, clause);
}

/**
 * Add a sum aggregation for the given column name.
 */
export function addSumAggregation(query: Query, columnName: string): Query {
  const operators = Lib.availableAggregationOperators(query, 0);
  const sumOp = operators.find((op) => {
    const info = Lib.displayInfo(query, 0, op);
    return info.shortName === "sum";
  });
  if (!sumOp) {
    return query;
  }

  const columns = Lib.aggregationOperatorColumns(sumOp);
  const lowerName = columnName.toLowerCase();
  const col = columns.find((c) => {
    const info = Lib.displayInfo(query, 0, c);
    return info.name?.toLowerCase() === lowerName;
  });
  if (!col) {
    return query;
  }

  const clause = Lib.aggregationClause(sumOp, col);
  return Lib.aggregate(query, 0, clause);
}

/**
 * Apply the aggregation corresponding to the selected metric.
 */
export function applyUsageStatsAggregation(
  query: Query,
  metric: UsageStatsMetric,
): { query: Query; orderColumnName: string } {
  switch (metric) {
    case "conversations":
      return {
        query: Lib.aggregateByCount(query, 0),
        orderColumnName: "count",
      };
    case "messages":
      return {
        query: addSumAggregation(query, "message_count"),
        orderColumnName: "sum",
      };
    case "tokens":
      return {
        query: addSumAggregation(query, "total_tokens"),
        orderColumnName: "sum",
      };
  }
}

/**
 * Get the chart title for a given metric and dimension.
 * Uses explicit strings for ttag i18n extraction.
 */
export function getChartTitle(
  metric: UsageStatsMetric,
  dimension: "day" | "user" | "group" | "profile" | "source" | "ip_address",
): string {
  const titles = {
    conversations: {
      day: t`Conversations by day`,
      user: t`Users with most conversations`,
      group: t`Groups with most conversations`,
      profile: t`Conversations by profile`,
      source: t`Conversations by source`,
      ip_address: t`IP addresses with most conversations`,
    },
    messages: {
      day: t`Messages by day`,
      user: t`Users with most messages`,
      group: t`Groups with most messages`,
      profile: t`Messages by profile`,
      source: t`Messages by source`,
      ip_address: t`IP addresses with most messages`,
    },
    tokens: {
      day: t`Tokens by day`,
      user: t`Users with most tokens`,
      group: t`Groups with most tokens`,
      profile: t`Tokens by profile`,
      source: t`Tokens by source`,
      ip_address: t`IP addresses with most tokens`,
    },
  };
  return titles[metric][dimension];
}

/**
 * Get the section heading label for a given metric.
 */
export function getMetricLabel(metric: UsageStatsMetric): string {
  switch (metric) {
    case "conversations":
      return t`Conversations`;
    case "messages":
      return t`Messages`;
    case "tokens":
      return t`Tokens`;
  }
}
