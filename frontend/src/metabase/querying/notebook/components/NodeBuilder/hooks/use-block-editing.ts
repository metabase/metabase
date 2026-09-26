import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
} from "react";

import type * as Lib from "metabase-lib";

import {
  trackNodeBuilderBlockEdited,
  trackNodeBuilderSourcePicked,
} from "../analytics";
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
import type { BuilderNode, NamedExpression, SourceItem } from "../types";

import { useSourceLoader } from "./use-source-loader";

type Options = {
  nodesRef: MutableRefObject<BuilderNode[]>;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
};

// Everything a block can change about itself. Data edits bump the block's
// version so the graph recompiles; fold state does not.
export function useBlockEditing({ nodesRef, setNodes }: Options) {
  const loadSource = useSourceLoader();
  // Loads can overlap while the picker stays open; only the newest one for a block may land.
  const pickRequestsRef = useRef(new Map<string, number>());

  const updateNodeData = useCallback(
    <N extends BuilderNode>(
      nodeId: string,
      guard: (node: BuilderNode) => node is N,
      update: (data: N["data"]) => Partial<N["data"]>,
      { silent = false } = {},
    ) => {
      const kind = nodesRef.current.find((node) => node.id === nodeId)?.type;
      if (kind && !silent) {
        trackNodeBuilderBlockEdited(kind);
      }
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
    [nodesRef, setNodes],
  );

  const pickSource = useCallback(
    async (nodeId: string, source: SourceItem) => {
      const request = (pickRequestsRef.current.get(nodeId) ?? 0) + 1;
      pickRequestsRef.current.set(nodeId, request);
      try {
        const picked = await loadSource(source.id, source.databaseId);
        if (pickRequestsRef.current.get(nodeId) !== request) {
          return;
        }
        updateNodeData(
          nodeId,
          isTableNode,
          () => ({ ...picked, excludedColumns: [] }),
          { silent: true },
        );
        trackNodeBuilderSourcePicked(source.kind);
      } catch (error) {
        console.error("Node builder: could not pick a source", error);
      }
    },
    [loadSource, updateNodeData],
  );

  const toggleColumn = useCallback(
    (nodeId: string, columnName: string) => {
      const node = nodesRef.current.find((node) => node.id === nodeId);
      if (
        node &&
        isTableNode(node) &&
        !node.data.excludedColumns.includes(columnName) &&
        node.data.excludedColumns.length + 1 >= node.data.columns.length
      ) {
        // MLv2 cannot hold an empty field list, so the last column stays.
        return;
      }
      updateNodeData(nodeId, isTableNode, (data) => ({
        excludedColumns: data.excludedColumns.includes(columnName)
          ? data.excludedColumns.filter((name) => name !== columnName)
          : [...data.excludedColumns, columnName],
      }));
    },
    [nodesRef, updateNodeData],
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
    ) => {
      updateNodeData(nodeId, isSummarizeNode, () => ({
        aggregations,
        breakoutColumns,
      }));
    },
    [updateNodeData],
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
