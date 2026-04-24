import dayjs from "dayjs";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import { color } from "metabase/ui/colors/palette";
import type {
  CardMetadata,
  ColumnMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { VIEW_CONVERSATIONS, VIEW_USAGE_LOG } from "../../constants";

export type UsageStatsMetric = "conversations" | "messages" | "tokens";

// the user-set inputs that drive every chart on the stats page — three
// filters (date / user / group) plus the metric the tabs select
export type StatsFilters = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupId?: number;
  metric: UsageStatsMetric;
};

// The Tokens tab reads from v_ai_usage_log (per-LLM-call ledger) for complete
// token accounting across all call sites. The Conversations and Messages tabs
// stay on v_metabot_conversations because aggregate-by-count and sum(message_count)
// would be semantically wrong over a per-LLM-call table.
export function getViewForMetric(metric: UsageStatsMetric): string {
  return metric === "tokens" ? VIEW_USAGE_LOG : VIEW_CONVERSATIONS;
}

const METRIC_ACCENT: Record<UsageStatsMetric, string> = {
  conversations: "accent0",
  tokens: "accent2",
  messages: "accent4",
};

const METRIC_COLUMN_NAME: Record<UsageStatsMetric, string> = {
  conversations: "count",
  tokens: "sum",
  messages: "sum",
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

export function applyUserFilter(
  query: Query,
  userId: number | undefined,
  columnName = "user_id",
): Query {
  if (userId == null) {
    return query;
  }
  const col = findColumn(query, columnName, Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "=", column: col, values: [userId] }),
  );
}

function findJoinableColumn(
  columns: ColumnMetadata[],
  query: Query,
  name: string,
): ColumnMetadata | undefined {
  const lower = name.toLowerCase();
  return columns.find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name?.toLowerCase() === lower;
  });
}

// the source view's group_name is lossy (alphabetically-first non-All-Users
// group only), so callers needing "all groups a user belongs to" join here
export function joinGroupMembers(
  query: Query,
  groupMembersTable: TableMetadata | CardMetadata | null | undefined,
  sourceUserIdColumn = "user_id",
): Query {
  if (!groupMembersTable) {
    return query;
  }

  const lhsColumns = Lib.joinConditionLHSColumns(
    query,
    0,
    groupMembersTable,
    undefined,
    undefined,
  );
  const rhsColumns = Lib.joinConditionRHSColumns(
    query,
    0,
    groupMembersTable,
    undefined,
    undefined,
  );
  const lhsUserId = findJoinableColumn(lhsColumns, query, sourceUserIdColumn);
  const rhsUserId = findJoinableColumn(rhsColumns, query, "user_id");
  if (!lhsUserId || !rhsUserId) {
    return query;
  }

  const innerJoin = Lib.availableJoinStrategies(query, 0).find((strategy) => {
    const info = Lib.displayInfo(query, 0, strategy);
    return info.shortName === "inner-join";
  });
  if (!innerJoin) {
    return query;
  }

  const condition = Lib.joinConditionClause("=", lhsUserId, rhsUserId);
  return Lib.join(
    query,
    0,
    Lib.joinClause(groupMembersTable, [condition], innerJoin),
  );
}

// no-op pre-join: group_id only exists on v_group_members
export function applyGroupIdFilter(
  query: Query,
  groupId: number | undefined,
): Query {
  if (groupId == null) {
    return query;
  }
  const col = findColumn(query, "group_id", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "=", column: col, values: [groupId] }),
  );
}

// matches the view's own group_name subquery (WHERE pg.id != 1) so a
// by-group breakout isn't dominated by an All Users bar
export function excludeAllUsersGroup(query: Query): Query {
  const col = findColumn(query, "group_id", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "!=", column: col, values: [1] }),
  );
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

export function applyUsageStatsAggregation(
  query: Query,
  metric: UsageStatsMetric,
): Query {
  return match(metric)
    .with("conversations", () => Lib.aggregateByCount(query, 0))
    .with("messages", () => addSumAggregation(query, "message_count"))
    .with("tokens", () =>
      addSumAggregation(
        addSumAggregation(query, "prompt_tokens"),
        "completion_tokens",
      ),
    )
    .exhaustive();
}

function getOrderColumnName(metric: UsageStatsMetric): string | null {
  return match(metric)
    .with("conversations", () => "count")
    .with("messages", () => "sum")
    .with("tokens", () => null)
    .exhaustive();
}

export function applyMetricOrderBy(
  query: Query,
  metric: UsageStatsMetric,
): Query {
  const orderColumnName = getOrderColumnName(metric);
  if (!orderColumnName) {
    return query;
  }
  const orderCol = findColumn(query, orderColumnName, Lib.orderableColumns);
  if (!orderCol) {
    return query;
  }
  return Lib.orderBy(query, 0, orderCol, "desc");
}

export type SourceBreakoutQueryOpts = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  breakoutColumn: string;
};

export function buildSourceBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  breakoutColumn,
}: SourceBreakoutQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyUserFilter(q, userId);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyGroupIdFilter(q, groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByColumn(q, breakoutColumn);
  q = applyMetricOrderBy(q, metric);
  return q;
}

export function breakoutByColumn(query: Query, columnName: string): Query {
  const col = findColumn(query, columnName, Lib.breakoutableColumns);
  return col ? Lib.breakout(query, 0, col) : query;
}

export function breakoutByColumnWithBucket(
  query: Query,
  columnName: string,
  bucketName: string,
): Query {
  const col = findColumn(query, columnName, Lib.breakoutableColumns);
  if (!col) {
    return query;
  }
  const bucket = Lib.availableTemporalBuckets(query, 0, col).find((b) => {
    return Lib.displayInfo(query, 0, b).shortName === bucketName;
  });
  const bucketed = bucket ? Lib.withTemporalBucket(col, bucket) : col;
  return Lib.breakout(query, 0, bucketed);
}

export type TimeseriesBreakoutQueryOpts = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  breakoutColumn: string;
  bucketName: string;
};

export function buildTimeseriesBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  breakoutColumn,
  bucketName,
}: TimeseriesBreakoutQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyUserFilter(q, userId);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyGroupIdFilter(q, groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByColumnWithBucket(q, breakoutColumn, bucketName);
  return q;
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
