import { createContext, useContext } from "react";

import type * as Lib from "metabase-lib";
import type { Database, DatabaseId, TableId } from "metabase-types/api";

import type { CompiledGraph } from "./graph";
import type { NamedExpression, SourceItem } from "./types";

export type NodeBuilderContextType = {
  compiled: CompiledGraph;
  readOnly: boolean;
  isMetric: boolean;
  isRunnable: boolean;
  sources: SourceItem[];
  databases: Database[];
  isLoadingSources: boolean;
  // Once any table is on the canvas, every other one has to come from the
  // same database.
  sourceDatabaseId: DatabaseId | null;
  onVisualize: () => void;
  onPickTable: (
    nodeId: string,
    tableId: TableId,
    databaseId: DatabaseId,
  ) => void;
  onToggleColumn: (nodeId: string, columnName: string) => void;
  onStrategyChange: (nodeId: string, strategy: Lib.JoinStrategy) => void;
  onConditionsChange: (nodeId: string, conditions: Lib.JoinCondition[]) => void;
  onRemoveNode: (nodeId: string) => void;
  // Adds a block that works on a summarize's results, on the next stage.
  onAddStageBlock: (
    summarizeNodeId: string,
    kind: "expression" | "filter" | "summarize" | "join",
  ) => void;
  onToggleCollapsed: (nodeId: string) => void;
  onLimitChange: (nodeId: string, limit: number | null) => void;
  onOrderBysChange: (nodeId: string, orderBys: Lib.OrderByClause[]) => void;
  onFiltersChange: (nodeId: string, filters: Lib.FilterClause[]) => void;
  onExpressionsChange: (nodeId: string, expressions: NamedExpression[]) => void;
  onSummarizeChange: (
    nodeId: string,
    aggregations: Lib.AggregationClause[],
    breakoutColumns: Lib.ColumnMetadata[],
    orderBys: Lib.OrderByClause[],
  ) => void;
};

export const NodeBuilderContext = createContext<
  NodeBuilderContextType | undefined
>(undefined);

export function useNodeBuilderContext(): NodeBuilderContextType {
  const context = useContext(NodeBuilderContext);
  if (context === undefined) {
    throw new Error("useNodeBuilderContext must be used within a NodeBuilder");
  }
  return context;
}
