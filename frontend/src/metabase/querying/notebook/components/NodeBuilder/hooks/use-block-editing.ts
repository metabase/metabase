import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";

import type * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import {
  isExpressionNode,
  isFilterNode,
  isJoinNode,
  isLimitNode,
  isNodeCollapsed,
  isSortNode,
  isSummarizeNode,
  isTableNode,
  withCollapsed,
} from "../graph";
import type { BuilderNode, NamedExpression } from "../types";

import { useSourceLoader } from "./use-source-loader";

type Options = {
  nodesRef: MutableRefObject<BuilderNode[]>;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
};

// Everything a block can change about itself. Data edits bump the block's
// version so the graph recompiles; fold state does not.
export function useBlockEditing({ nodesRef, setNodes }: Options) {
  const loadSource = useSourceLoader();

  const updateNodeData = useCallback(
    <N extends BuilderNode>(
      nodeId: string,
      guard: (node: BuilderNode) => node is N,
      update: (data: N["data"]) => Partial<N["data"]>,
    ) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) =>
          node.id === nodeId && guard(node)
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...update(node.data),
                  version: node.data.version + 1,
                },
              }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const pickSource = useCallback(
    async (nodeId: string, tableId: TableId, databaseId: DatabaseId) => {
      try {
        const picked = await loadSource(tableId, databaseId);
        updateNodeData(nodeId, isTableNode, () => ({
          ...picked,
          excludedColumns: [],
        }));
      } catch (error) {
        console.error("Node builder: could not pick a source", error);
      }
    },
    [loadSource, updateNodeData],
  );

  const toggleColumn = useCallback(
    (nodeId: string, columnName: string) => {
      updateNodeData(nodeId, isTableNode, (data) => ({
        excludedColumns: data.excludedColumns.includes(columnName)
          ? data.excludedColumns.filter((name) => name !== columnName)
          : [...data.excludedColumns, columnName],
      }));
    },
    [updateNodeData],
  );

  const changeStrategy = useCallback(
    (nodeId: string, strategy: Lib.JoinStrategy) =>
      updateNodeData(nodeId, isJoinNode, () => ({ strategy })),
    [updateNodeData],
  );

  const changeConditions = useCallback(
    (nodeId: string, conditions: Lib.JoinCondition[]) =>
      updateNodeData(nodeId, isJoinNode, () => ({ conditions })),
    [updateNodeData],
  );

  const changeLimit = useCallback(
    (nodeId: string, limit: number | null) =>
      updateNodeData(nodeId, isLimitNode, () => ({ limit })),
    [updateNodeData],
  );

  const changeOrderBys = useCallback(
    (nodeId: string, orderBys: Lib.OrderByClause[]) =>
      updateNodeData(nodeId, isSortNode, () => ({ orderBys })),
    [updateNodeData],
  );

  const changeFilters = useCallback(
    (nodeId: string, filters: Lib.FilterClause[]) =>
      updateNodeData(nodeId, isFilterNode, () => ({ filters })),
    [updateNodeData],
  );

  const changeExpressions = useCallback(
    (nodeId: string, expressions: NamedExpression[]) =>
      updateNodeData(nodeId, isExpressionNode, () => ({ expressions })),
    [updateNodeData],
  );

  const changeSummarize = useCallback(
    (
      nodeId: string,
      aggregations: Lib.AggregationClause[],
      breakoutColumns: Lib.ColumnMetadata[],
      orderBys: Lib.OrderByClause[],
    ) => {
      updateNodeData(nodeId, isSummarizeNode, () => ({
        aggregations,
        breakoutColumns,
      }));
      // MLv2 drops the sorts that pointed at a removed metric or group; the sort block follows.
      const sortNode = nodesRef.current.find(isSortNode);
      if (sortNode) {
        updateNodeData(sortNode.id, isSortNode, () => ({ orderBys }));
      }
    },
    [updateNodeData, nodesRef],
  );

  const toggleCollapsed = useCallback(
    (nodeId: string) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) =>
          node.id === nodeId
            ? withCollapsed(node, !isNodeCollapsed(node))
            : node,
        ),
      );
    },
    [setNodes],
  );

  const setAllCollapsed = useCallback(
    (collapsed: boolean) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) => withCollapsed(node, collapsed)),
      );
    },
    [setNodes],
  );

  return useMemo(
    () => ({
      pickSource,
      toggleColumn,
      changeStrategy,
      changeConditions,
      changeLimit,
      changeOrderBys,
      changeFilters,
      changeExpressions,
      changeSummarize,
      toggleCollapsed,
      setAllCollapsed,
    }),
    [
      pickSource,
      toggleColumn,
      changeStrategy,
      changeConditions,
      changeLimit,
      changeOrderBys,
      changeFilters,
      changeExpressions,
      changeSummarize,
      toggleCollapsed,
      setAllCollapsed,
    ],
  );
}
