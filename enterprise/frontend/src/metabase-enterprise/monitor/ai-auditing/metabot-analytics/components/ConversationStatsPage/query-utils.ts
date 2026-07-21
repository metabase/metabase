import { P, match } from "ts-pattern";
import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import type { ColorName } from "metabase/ui/colors/types";
import type {
  CardMetadata,
  ColumnMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

export type GetColor = (name: ColorName) => string;

export type UsageStatsMetric = "conversations" | "messages" | "tokens";

export type StatsFilters = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupId?: number;
  tenantId?: number;
  metric: UsageStatsMetric;
};

export const tableForMetric = <T extends TableMetadata | CardMetadata | null>(
  metric: UsageStatsMetric,
  conversationsTable: T,
  usageLogTable: T,
): T => (metric === "tokens" ? usageLogTable : conversationsTable);

const METRIC_ACCENT: Record<UsageStatsMetric, ColorName> = {
  conversations: "accent0",
  tokens: "accent2",
  messages: "accent4",
};

const METRIC_COLUMN_NAME: Record<UsageStatsMetric, string> = {
  conversations: "count",
  tokens: "sum",
  messages: "sum",
};

type TokenSeriesSettings = Pick<
  VisualizationSettings,
  "series_settings" | "graph.metrics"
>;

export function getMetricSeriesSettings(
  metric: UsageStatsMetric,
  getColor: GetColor,
  aggregationColumnNames?: string[],
  options?: { dualAxis?: boolean },
): TokenSeriesSettings {
  return match({ metric, cols: aggregationColumnNames })
    .with(
      { metric: "tokens", cols: [P.string, P.string] as const },
      ({ cols: [inputCol, outputCol] }) => ({
        series_settings: {
          [inputCol]: {
            color: getColor("accent2"),
            title: t`Input tokens`,
            ...(options?.dualAxis && { axis: "left" }),
          },
          [outputCol]: {
            color: getColor("accent3"),
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
          [colName]: { color: getColor(METRIC_ACCENT[metric]) },
        },
      };
    });
}

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

export function applyIdFilter(
  query: Query,
  columnName: string,
  id: number | undefined,
): Query {
  if (id == null) {
    return query;
  }
  const column = findColumn(query, columnName, Lib.filterableColumns);
  if (!column) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "=", column, values: [id] }),
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

export function joinGroupMembers(
  query: Query,
  groupMembersTable: TableMetadata | CardMetadata,
  sourceUserIdColumn = "user_id",
): Query {
  const lhsColumns = Lib.joinConditionLHSColumns(query, 0, groupMembersTable);
  const lhsUserId = findJoinableColumn(lhsColumns, query, sourceUserIdColumn);
  const rhsColumns = Lib.joinConditionRHSColumns(query, 0, groupMembersTable);
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

  return Lib.join(
    query,
    0,
    Lib.joinClause(
      groupMembersTable,
      [Lib.joinConditionClause("=", lhsUserId, rhsUserId)],
      innerJoin,
    ),
  );
}

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

type SourceBreakoutQueryOpts = StatsFilters & {
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
  tenantId,
  metric,
  breakoutColumn,
}: SourceBreakoutQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyIdFilter(q, "user_id", userId);
  q = applyIdFilter(q, "tenant_id", tenantId);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyIdFilter(q, "group_id", groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByColumn(q, breakoutColumn);
  q = applyMetricOrderBy(q, metric);
  return q;
}

export function breakoutByColumn(query: Query, columnName: string): Query {
  const col = findColumn(query, columnName, Lib.breakoutableColumns);
  return col ? Lib.breakout(query, 0, col) : query;
}

type BreakoutQueryOpts = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

type GroupBreakoutQueryOpts = BreakoutQueryOpts & {
  excludeAllUsers: boolean;
};

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

function normalizeBreakoutName(name?: string): string {
  return name?.toLowerCase().replace(/[\s_-]/g, "") ?? "";
}

function breakoutByJoinedGroupName(query: Query): Query {
  const col = Lib.breakoutableColumns(query, 0).find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    const names = [info.name, info.displayName, info.longDisplayName].map(
      normalizeBreakoutName,
    );

    return (
      info.isFromJoin &&
      names.some((name) => name === "groupname" || name.endsWith("groupname"))
    );
  });
  return col ? Lib.breakout(query, 0, col) : query;
}

export function buildGroupBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
  excludeAllUsers,
}: GroupBreakoutQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyIdFilter(q, "user_id", userId);
  q = applyIdFilter(q, "tenant_id", tenantId);
  q = joinGroupMembers(q, groupMembersTable);
  q = excludeAllUsers ? excludeAllUsersGroup(q) : q;
  q = applyIdFilter(q, "group_id", groupId);
  q = breakoutByJoinedGroupName(q);
  q = applyUsageStatsAggregation(q, metric);
  q = applyMetricOrderBy(q, metric);
  return q;
}

function applyTenantNotNullFilter(query: Query): Query {
  const col = findColumn(query, "tenant_id", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(query, 0, Lib.expressionClause("not-null", [col], null));
}

export function buildTenantBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
}: BreakoutQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyIdFilter(q, "user_id", userId);
  q = applyIdFilter(q, "tenant_id", tenantId);
  q = applyTenantNotNullFilter(q);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyIdFilter(q, "group_id", groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByColumn(q, "tenant_id");
  q = applyMetricOrderBy(q, metric);
  return q;
}
