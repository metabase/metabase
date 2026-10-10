// Block kinds: type guards, creators and the structure key.

import type { XYPosition } from "@xyflow/react";

import type * as Lib from "metabase-lib";

import type {
  BuilderEdge,
  BuilderNode,
  DockNodeType,
  ExpressionFlowNode,
  FilterFlowNode,
  JoinFlowNode,
  LimitFlowNode,
  NamedExpression,
  ResultFlowNode,
  SortFlowNode,
  SummarizeFlowNode,
  TableFlowNode,
} from "../types";

import { DRAG_HANDLE_CLASS, RESULT_NODE_ID } from "./constants";
import type { PickedTable } from "./sources";

export function isJoinNode(node: BuilderNode): node is JoinFlowNode {
  return node.type === "join";
}

export function isResultNode(node: BuilderNode): node is ResultFlowNode {
  return node.type === "result";
}

export function isTableNode(node: BuilderNode): node is TableFlowNode {
  return node.type === "table";
}

export function isExpressionNode(
  node: BuilderNode,
): node is ExpressionFlowNode {
  return node.type === "expression";
}

export function isFilterNode(node: BuilderNode): node is FilterFlowNode {
  return node.type === "filter";
}

export function isLimitNode(node: BuilderNode): node is LimitFlowNode {
  return node.type === "limit";
}

export function isSortNode(node: BuilderNode): node is SortFlowNode {
  return node.type === "sort";
}

export function isSummarizeNode(node: BuilderNode): node is SummarizeFlowNode {
  return node.type === "summarize";
}

type UtilityNode =
  | ExpressionFlowNode
  | FilterFlowNode
  | SummarizeFlowNode
  | SortFlowNode
  | LimitFlowNode;

// Blocks that add stage clauses on top of whatever feeds them.
export function isUtilityNode(node: BuilderNode): node is UtilityNode {
  return (
    isExpressionNode(node) ||
    isFilterNode(node) ||
    isSummarizeNode(node) ||
    isSortNode(node) ||
    isLimitNode(node)
  );
}

// Where a block may sit along the chain: MBQL adds custom columns, applies
// filters, then the summary, then order-bys and the limit, so wires must
// respect this order.
export function stageRank(node: BuilderNode): number {
  if (isExpressionNode(node)) {
    return 1;
  }
  if (isFilterNode(node)) {
    return 2;
  }
  if (isSummarizeNode(node)) {
    return 3;
  }
  if (isSortNode(node)) {
    return 4;
  }
  if (isLimitNode(node)) {
    return 5;
  }
  return 0;
}

// Tables start folded to their header; everything else starts open.
export function isNodeCollapsed(node: BuilderNode): boolean {
  return node.data.collapsed ?? isTableNode(node);
}

export function withCollapsed(
  node: BuilderNode,
  collapsed: boolean,
): BuilderNode {
  // Every node kind carries the same optional flag, so the spread keeps the
  // node's shape; TypeScript cannot see that across the union.
  return { ...node, data: { ...node.data, collapsed } } as BuilderNode;
}

let nodeCounter = 0;

function nextNodeId(kind: DockNodeType) {
  nodeCounter += 1;
  return `${kind}-${Date.now()}-${nodeCounter}`;
}

const DRAG_HANDLE = `.${DRAG_HANDLE_CLASS}`;

export const ORIGIN: XYPosition = { x: 0, y: 0 };

export function createResultNode(
  position: XYPosition = ORIGIN,
): ResultFlowNode {
  return {
    id: RESULT_NODE_ID,
    type: "result",
    position,
    dragHandle: DRAG_HANDLE,
    deletable: false,
    data: { version: 0 },
  };
}

export function createTableNode(
  position: XYPosition,
  picked: PickedTable | null,
  excludedColumns: string[] = [],
): TableFlowNode {
  return {
    id: nextNodeId("table"),
    type: "table",
    position,
    dragHandle: DRAG_HANDLE,
    data: {
      table: picked?.table ?? null,
      databaseId: picked?.databaseId ?? null,
      tableName: picked?.tableName ?? "",
      columns: picked?.columns ?? [],
      excludedColumns,
      version: 0,
    },
  };
}

export function createJoinNode(
  position: XYPosition,
  strategy: Lib.JoinStrategy | null = null,
  conditions: Lib.JoinCondition[] | null = null,
  seededJoin: Lib.Join | null = null,
): JoinFlowNode {
  return {
    id: nextNodeId("join"),
    type: "join",
    position,
    dragHandle: DRAG_HANDLE,
    data: { strategy, conditions, seededJoin, version: 0 },
  };
}

export function createExpressionNode(
  position: XYPosition,
  expressions: NamedExpression[] = [],
): ExpressionFlowNode {
  return {
    id: nextNodeId("expression"),
    type: "expression",
    position,
    dragHandle: DRAG_HANDLE,
    data: { expressions, version: 0 },
  };
}

export function createFilterNode(
  position: XYPosition,
  filters: Lib.FilterClause[] = [],
): FilterFlowNode {
  return {
    id: nextNodeId("filter"),
    type: "filter",
    position,
    dragHandle: DRAG_HANDLE,
    data: { filters, version: 0 },
  };
}

export function createLimitNode(
  position: XYPosition,
  limit: number | null = null,
): LimitFlowNode {
  return {
    id: nextNodeId("limit"),
    type: "limit",
    position,
    dragHandle: DRAG_HANDLE,
    data: { limit, version: 0 },
  };
}

export function createSummarizeNode(
  position: XYPosition,
  aggregations: Lib.AggregationClause[] = [],
  breakoutColumns: Lib.ColumnMetadata[] = [],
): SummarizeFlowNode {
  return {
    id: nextNodeId("summarize"),
    type: "summarize",
    position,
    dragHandle: DRAG_HANDLE,
    data: { aggregations, breakoutColumns, version: 0 },
  };
}

export function createSortNode(
  position: XYPosition,
  orderBys: Lib.OrderByClause[] = [],
): SortFlowNode {
  return {
    id: nextNodeId("sort"),
    type: "sort",
    position,
    dragHandle: DRAG_HANDLE,
    data: { orderBys, version: 0 },
  };
}

// Only the graph's structure matters for compiling; positions do not.
export function graphKey(nodes: BuilderNode[], edges: BuilderEdge[]): string {
  const nodeKey = nodes
    .map((node) => `${node.id}@${node.data.version}`)
    .join("|");
  const edgeKey = edges.map((edge) => edge.id).join("|");
  return `${nodeKey}#${edgeKey}`;
}

// Blocks that work on a summarize's results, and so start the next stage.
export function startsNextStage(node: BuilderNode): boolean {
  return (
    isJoinNode(node) ||
    isExpressionNode(node) ||
    isFilterNode(node) ||
    isSummarizeNode(node)
  );
}

// A blank block of the given kind, as the dock drops it.
export function createBlankNode(
  kind: DockNodeType,
  position: XYPosition,
): BuilderNode {
  switch (kind) {
    case "table":
      return createTableNode(position, null);
    case "join":
      return createJoinNode(position);
    case "expression":
      return createExpressionNode(position);
    case "filter":
      return createFilterNode(position);
    case "summarize":
      return createSummarizeNode(position);
    case "sort":
      return createSortNode(position);
    case "limit":
      return createLimitNode(position);
  }
}
