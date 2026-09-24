import type { Edge, Node } from "@xyflow/react";

import type * as Lib from "metabase-lib";
import type { DatabaseId, IconName, TableId } from "metabase-types/api";

// Anything a table block can stand for: a table, a model or a saved question.
export type SourceKind = "table" | "model" | "question";

export type SourceItem = {
  // A card's id is its virtual table id, `card__N`.
  id: TableId;
  name: string;
  databaseId: DatabaseId;
  kind: SourceKind;
};

export type ColumnSummary = {
  name: string;
  displayName: string;
  longDisplayName: string;
  icon: IconName;
};

export type TableNodeData = {
  table: Lib.Joinable | null;
  databaseId: DatabaseId | null;
  tableName: string;
  columns: ColumnSummary[];
  // Column names left out of the query. Empty means "all columns".
  excludedColumns: string[];
  // Bumped on every data change so the graph can be recompiled only when its
  // structure changes, not on every drag.
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type JoinNodeData = {
  // Both fall back to sensible defaults at compile time when null.
  strategy: Lib.JoinStrategy | null;
  conditions: Lib.JoinCondition[] | null;
  // The join as loaded from the question: its alias is what downstream clauses point at.
  seededJoin: Lib.Join | null;
  // Joins a summarize's results, so it lives in the ladder after it.
  afterSummarize?: boolean;
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type ResultNodeData = {
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type LimitNodeData = {
  limit: number | null;
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type NamedExpression = {
  name: string;
  clause: Lib.ExpressionClause;
};

export type ExpressionNodeData = {
  // Custom columns, re-applied to the compiled query on every rebuild.
  expressions: NamedExpression[];
  // Adds columns to a summarize's results, so it lives in the ladder after it.
  afterSummarize?: boolean;
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type FilterNodeData = {
  filters: Lib.FilterClause[];
  // Filters the results of a summarize, so it lives in the ladder after it
  // and on the next stage of the query.
  afterSummarize?: boolean;
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type SummarizeNodeData = {
  aggregations: Lib.AggregationClause[];
  // Breakouts are kept as the columns they group by (with any binning or
  // bucketing applied), which is what `Lib.breakout` takes.
  breakoutColumns: Lib.ColumnMetadata[];
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type SortNodeData = {
  // Order-by clauses, re-applied to the compiled query on every rebuild.
  orderBys: Lib.OrderByClause[];
  version: number;
  // Folded to its header. Unset means the block kind's default.
  collapsed?: boolean;
};

export type TableFlowNode = Node<TableNodeData, "table">;
export type JoinFlowNode = Node<JoinNodeData, "join">;
export type ResultFlowNode = Node<ResultNodeData, "result">;
export type LimitFlowNode = Node<LimitNodeData, "limit">;
export type SortFlowNode = Node<SortNodeData, "sort">;
export type FilterFlowNode = Node<FilterNodeData, "filter">;
export type ExpressionFlowNode = Node<ExpressionNodeData, "expression">;
export type SummarizeFlowNode = Node<SummarizeNodeData, "summarize">;

export type BuilderNode =
  | TableFlowNode
  | JoinFlowNode
  | ResultFlowNode
  | LimitFlowNode
  | SortFlowNode
  | FilterFlowNode
  | ExpressionFlowNode
  | SummarizeFlowNode;
export type BuilderEdge = Edge;

export type DockNodeType =
  | "table"
  | "join"
  | "expression"
  | "filter"
  | "summarize"
  | "sort"
  | "limit";
