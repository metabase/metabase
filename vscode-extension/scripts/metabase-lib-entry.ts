// Custom entry point that re-exports the metabase-lib v2 API
// plus v1 Metadata class needed for constructing MetadataProviders

export {
  // Metadata
  metadataProvider,
  displayInfo,
  tableOrCardMetadata,
  queryDisplayInfo,
  visibleColumns,
  returnedColumns,
} from "metabase-lib/metadata";

export {
  // Query
  queryFromTableOrCardMetadata,
  toLegacyQuery,
  stageCount,
  stageIndexes,
  sourceTableOrCardId,
  dropEmptyStages,
  fromJsQuery,
  fromJsQueryAndMetadata,
} from "metabase-lib/query";

export {
  // Filter
  filters,
} from "metabase-lib/filter";

export {
  // Aggregation
  aggregations,
} from "metabase-lib/aggregation";

export {
  // Breakout
  breakouts,
} from "metabase-lib/breakout";

export {
  // Order by
  orderBys,
} from "metabase-lib/order_by";

export {
  // Limit
  currentLimit,
  hasLimit,
} from "metabase-lib/limit";

export {
  // Join
  joins,
  joinedThing,
  joinConditions,
} from "metabase-lib/join";

export {
  // Expression
  expressions,
} from "metabase-lib/expression";

export {
  // Database
  databaseID,
} from "metabase-lib/database";

// Re-export types
export type {
  Query,
  Clause,
  ClauseType,
  ColumnMetadata,
  MetadataProvider,
  FilterClause,
  AggregationClause,
  BreakoutClause,
  OrderByClause,
  Join,
  ExpressionClause,
  Limit,
  DisplayInfo,
  ClauseDisplayInfo,
  QueryDisplayInfo,
  TableMetadata,
  CardMetadata,
} from "metabase-lib/types";
