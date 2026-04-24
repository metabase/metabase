import dayjs from "dayjs";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import { color } from "metabase/ui/colors/palette";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { VIEW_USAGE_LOG } from "../../constants";

export type UsageStatsMetric = "conversations" | "messages" | "tokens";

// All three tabs read from v_ai_usage_log. Messages = COUNT DISTINCT request_id
// (one per run-agent-loop call), Conversations = COUNT DISTINCT conversation_id.
export function getViewForMetric(_metric: UsageStatsMetric): string {
  return VIEW_USAGE_LOG;
}

const METRIC_ACCENT: Record<UsageStatsMetric, string> = {
  conversations: "accent0",
  tokens: "accent2",
  messages: "accent4",
};

const METRIC_COLUMN_NAME: Record<UsageStatsMetric, string> = {
  conversations: "count",
  tokens: "sum",
  messages: "count",
};

export type TokenSeriesSettings = Pick<
  VisualizationSettings,
  "series_settings" | "graph.metrics"
>;

export function getMetricSeriesSettings(
  metric: UsageStatsMetric,
  aggregationColumnNames?: string[],
  options?: { dualAxis?: boolean },
): TokenSeriesSettings {
  return match({ metric, cols: aggregationColumnNames })
    .with(
      { metric: "tokens", cols: [P.string, P.string] as const },
      ({ cols: [inputCol, outputCol] }) => ({
        series_settings: {
          [inputCol]: {
            color: color("accent2"),
            title: t`Input tokens`,
            ...(options?.dualAxis && { axis: "left" }),
          },
          [outputCol]: {
            color: color("accent3"),
            title: t`Output tokens`,
            ...(options?.dualAxis && { axis: "right" }),
          },
        },
        "graph.metrics": [inputCol, outputCol],
      }),
    )
    .otherwise(({ cols }) => {
      const colName = cols?.[0] ?? METRIC_COLUMN_NAME[metric];
      return {
        series_settings: {
          [colName]: { color: color(METRIC_ACCENT[metric]) },
        },
      };
    });
}

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
 * Apply a "column IS NOT NULL" filter.
 */
export function applyNotNullFilter(query: Query, columnName: string): Query {
  const col = findColumn(query, columnName, Lib.filterableColumns);
  if (!col) {
    return query;
  }
  const clause = Lib.defaultFilterClause({ operator: "not-null", column: col });
  return Lib.filter(query, 0, clause);
}

/**
 * Add a sum aggregation for the given column name.
 */
export function addSumAggregation(query: Query, columnName: string): Query {
  return addAggregationByShortName(query, columnName, "sum");
}

/**
 * Add a count-distinct aggregation for the given column name. The result column
 * is named "count" (see src/metabase/lib/aggregation.cljc — :distinct → "count").
 */
export function addCountDistinctAggregation(
  query: Query,
  columnName: string,
): Query {
  return addAggregationByShortName(query, columnName, "distinct");
}

function addAggregationByShortName(
  query: Query,
  columnName: string,
  shortName: string,
): Query {
  const operators = Lib.availableAggregationOperators(query, 0);
  const op = operators.find((o) => {
    const info = Lib.displayInfo(query, 0, o);
    return info.shortName === shortName;
  });
  if (!op) {
    return query;
  }

  const columns = Lib.aggregationOperatorColumns(op);
  const lowerName = columnName.toLowerCase();
  const col = columns.find((c) => {
    const info = Lib.displayInfo(query, 0, c);
    return info.name?.toLowerCase() === lowerName;
  });
  if (!col) {
    return query;
  }

  const clause = Lib.aggregationClause(op, col);
  return Lib.aggregate(query, 0, clause);
}

export function applyUsageStatsAggregation(
  query: Query,
  metric: UsageStatsMetric,
): { query: Query; orderColumnName: string | null } {
  switch (metric) {
    case "conversations": {
      const filtered = applyNotNullFilter(query, "conversation_id");
      return {
        query: addCountDistinctAggregation(filtered, "conversation_id"),
        orderColumnName: "count",
      };
    }
    case "messages": {
      const filtered = applyNotNullFilter(query, "conversation_id");
      return {
        query: addCountDistinctAggregation(filtered, "request_id"),
        orderColumnName: "count",
      };
    }
    case "tokens": {
      const withInput = addSumAggregation(query, "prompt_tokens");
      const withBoth = addSumAggregation(withInput, "completion_tokens");
      return { query: withBoth, orderColumnName: null };
    }
  }
}

/**
 * Get the chart title for a given metric and dimension.
 * Uses explicit strings for ttag i18n extraction.
 */
export function getChartTitle(
  metric: UsageStatsMetric,
  dimension:
    | "day"
    | "hour"
    | "user"
    | "group"
    | "profile"
    | "source"
    | "ip_address",
): string {
  const titles = {
    conversations: {
      day: t`Conversations by day`,
      hour: t`Conversations by hour`,
      user: t`Users with most conversations`,
      group: t`Groups with most conversations`,
      profile: t`Conversations by profile`,
      source: t`Conversations by source`,
      ip_address: t`IP addresses with most conversations`,
    },
    messages: {
      day: t`Messages by day`,
      hour: t`Messages by hour`,
      user: t`Users with most messages`,
      group: t`Groups with most messages`,
      profile: t`Messages by profile`,
      source: t`Messages by source`,
      ip_address: t`IP addresses with most messages`,
    },
    tokens: {
      day: t`Tokens by day`,
      hour: t`Tokens by hour`,
      user: t`Users with most tokens`,
      group: t`Groups with most tokens`,
      profile: t`Tokens by profile`,
      source: t`Tokens by source`,
      ip_address: t`IP addresses with most tokens`,
    },
  };
  return titles[metric][dimension];
}

export function isSingleDayFilter(dateFilter: DateFilterValue): boolean {
  if (dateFilter.type === "relative") {
    return dateFilter.unit === "day" && Math.abs(dateFilter.value) <= 1;
  }
  if (dateFilter.type === "specific" && !dateFilter.hasTime) {
    const { operator, values } = dateFilter;
    if (operator === "=") {
      return true;
    }
    if (operator === "between") {
      return dayjs(values[0]).isSame(values[1], "day");
    }
  }
  return false;
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
