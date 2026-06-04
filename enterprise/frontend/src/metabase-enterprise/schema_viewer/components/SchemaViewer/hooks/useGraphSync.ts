import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useLatest } from "react-use";

import type {
  ConcreteTableId,
  DatabaseId,
  SchemaName,
} from "metabase-types/api";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { applyLayout, getNodeId } from "../utils";

type UseGraphSyncArgs = {
  hasDbSelected: boolean;
  error: unknown;
  isFetching: boolean;
  // Normalized /erd response.
  graph: {
    nodes: SchemaViewerFlowNode[];
    edges: SchemaViewerFlowEdge[];
  } | null;
  // Nodes from useNodesState (already positioned on the canvas) — needed for incremental position merge.
  nodes: SchemaViewerFlowNode[];
  contextKey: `${DatabaseId}__${SchemaName}` | null;
  setNodes: (nodes: SchemaViewerFlowNode[]) => void;
  setEdges: (edges: SchemaViewerFlowEdge[]) => void;
  setExpandingTableIds: Dispatch<SetStateAction<Set<ConcreteTableId>>>;
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
};

type PendingExpansion = {
  // Node ID of the table the user expanded into — zoom target.
  targetNodeId: string;
  // Edge IDs to auto-select when node is rendered.
  candidateEdgeIds: readonly string[];
};

const clearExpandingTableIds = (prev: Set<ConcreteTableId>) =>
  prev.size === 0 ? prev : new Set<ConcreteTableId>();

function markPendingEdgeSelected(
  edges: SchemaViewerFlowEdge[],
  pending: PendingExpansion | null,
) {
  if (pending == null || pending.candidateEdgeIds.length === 0) {
    return edges;
  }

  const matchedId = pending.candidateEdgeIds.find((candidate) =>
    edges.some((edge) => edge.id === candidate),
  );

  if (matchedId == null) {
    return edges;
  }

  return edges.map((edge) =>
    edge.id === matchedId ? { ...edge, selected: true } : edge,
  );
}

function getExpandingTableIds(
  currentExpandingTableIds: Set<ConcreteTableId>,
  visibleNodes: SchemaViewerFlowNode[],
) {
  if (currentExpandingTableIds.size === 0) {
    return currentExpandingTableIds;
  }

  const visibleIds = new Set(visibleNodes.map((node) => node.data.table_id));
  let hasChanges = false;
  const newExpandingTableIds = new Set<ConcreteTableId>();

  for (const id of currentExpandingTableIds) {
    if (visibleIds.has(id)) {
      hasChanges = true;
    } else {
      newExpandingTableIds.add(id);
    }
  }

  return hasChanges ? newExpandingTableIds : currentExpandingTableIds;
}

function getMergedGraphLayout({
  graph,
  currentNodes,
}: {
  graph: NonNullable<UseGraphSyncArgs["graph"]>;
  currentNodes: SchemaViewerFlowNode[];
}) {
  return applyLayout({
    mode: "merge",
    incoming: graph.nodes,
    current: currentNodes,
    edges: graph.edges,
  });
}

function focusSyncedGraph({
  layout,
  pendingExpansionRef,
  zoomToNode,
  zoomToCanvas,
}: {
  layout: ReturnType<typeof applyLayout>;
  pendingExpansionRef: { current: PendingExpansion | null };
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
}) {
  const pending = pendingExpansionRef.current;

  if (layout.preservedExistingPositions) {
    // Incremental add: zoom onto the user-requested target if it's now in
    // the graph.
    if (
      pending != null &&
      layout.nodes.some((node) => node.id === pending.targetNodeId)
    ) {
      zoomToNode(pending.targetNodeId);
      pendingExpansionRef.current = null;
    }
  } else {
    // Fresh layout: fit the whole canvas.
    zoomToCanvas();
    pendingExpansionRef.current = null;
  }
}

/**
 * Owns the data → React Flow state sync for the schema viewer:
 *
 *  - Clears the canvas immediately on context change (database/schema swap).
 *  - When ERD response arrives: either lays out a fresh canvas or merges incoming nodes with the
 *    current canvas to preserve positions of tables that were already
 *    placed.
 *  - On FK expansion: once the new graph arrives, auto-selects the FK edge
 *    that triggered the expansion AND zooms onto the new target table.
 */
export function useGraphSync({
  hasDbSelected,
  error,
  isFetching,
  graph,
  nodes,
  contextKey,
  setNodes,
  setEdges,
  setExpandingTableIds,
  zoomToNode,
  zoomToCanvas,
}: UseGraphSyncArgs) {
  /**
   * Register the FK-expansion target. Once the next ERD response includes
   * a node for `targetTableId`, graph sync auto-selects the connecting
   * edge (from `candidateEdgeIds`) and zooms onto that node.
   *
   * `candidateEdgeIds` should include both source-first and target-first
   * orderings since the backend's source/target convention isn't fixed.
   */
  const pendingExpansionRef = useRef<PendingExpansion | null>(null);
  const registerPendingExpansion = useCallback(
    (targetTableId: ConcreteTableId, candidateEdgeIds?: readonly string[]) => {
      pendingExpansionRef.current = {
        targetNodeId: getNodeId({ table_id: targetTableId }),
        candidateEdgeIds: candidateEdgeIds ?? [],
      };
    },
    [],
  );

  const nodesRef = useLatest(nodes);
  const shouldClearCanvas = !hasDbSelected || error != null;
  const renderedGraph = shouldClearCanvas || isFetching ? null : graph;

  // Clear the canvas whenever the database/schema context changes.
  const prevContextForClearRef = useRef(contextKey);
  if (prevContextForClearRef.current !== contextKey) {
    prevContextForClearRef.current = contextKey;
    setNodes([]);
    setEdges([]);
    setExpandingTableIds(clearExpandingTableIds);
    pendingExpansionRef.current = null;
  }

  useEffect(() => {
    if (shouldClearCanvas) {
      setNodes([]);
      setEdges([]);
      setExpandingTableIds(clearExpandingTableIds);
      pendingExpansionRef.current = null;
    }
  }, [shouldClearCanvas, setEdges, setExpandingTableIds, setNodes]);

  useEffect(() => {
    if (renderedGraph == null) {
      return;
    }

    // If we expanded via FK click and a matching edge has now arrived in
    // the new graph, mark it as selected.
    setEdges(
      markPendingEdgeSelected(renderedGraph.edges, pendingExpansionRef.current),
    );
  }, [renderedGraph, setEdges]);

  useEffect(() => {
    if (renderedGraph == null) {
      return;
    }

    const layout = getMergedGraphLayout({
      graph: renderedGraph,
      currentNodes: nodesRef.current,
    });

    setNodes(layout.nodes);
    focusSyncedGraph({
      layout,
      pendingExpansionRef,
      zoomToNode,
      zoomToCanvas,
    });
  }, [nodesRef, renderedGraph, setNodes, zoomToCanvas, zoomToNode]);

  useEffect(() => {
    if (renderedGraph == null) {
      return;
    }

    // Clear any expand-in-flight markers for tables that just arrived in the
    // new graph (or that are no longer in the selection).
    setExpandingTableIds((prev) =>
      getExpandingTableIds(prev, renderedGraph.nodes),
    );
  }, [renderedGraph, setExpandingTableIds]);

  return { registerPendingExpansion };
}
