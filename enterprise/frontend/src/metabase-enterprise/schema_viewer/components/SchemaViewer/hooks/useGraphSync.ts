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
import { getNodeId } from "../utils";

import type { GraphLayoutMethods } from "./useGraphLayout";

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
  graphLayout: Pick<GraphLayoutMethods, "requestLayout" | "cancelLayout">;
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

function focusSyncedGraph({
  layout,
  pendingExpansionRef,
  zoomToNode,
  zoomToCanvas,
}: {
  layout: {
    nodes: SchemaViewerFlowNode[];
    preservedExistingPositions: boolean;
  };
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
 *  - When ERD response arrives: requests either a fresh worker layout or an
 *    incremental merge that preserves positions.
 *  - Commits nodes and their matching edges only after the current layout
 *    succeeds.
 *  - On FK expansion: once the new graph arrives, auto-selects the FK edge
 *    that triggered the expansion AND zooms onto that node.
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
  graphLayout,
}: UseGraphSyncArgs) {
  /**
   * Register the FK-expansion target. Once the next ERD response includes
   * a node for `targetTableId`, graph sync auto-selects the connecting
   * edge (from `candidateEdgeIds`) and zooms onto that node.
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
  const { requestLayout, cancelLayout } = graphLayout;
  const shouldClearCanvas = !hasDbSelected || error != null;
  const renderedGraph = shouldClearCanvas || isFetching ? null : graph;

  // Clear the canvas immediately whenever the database/schema context changes.
  const prevContextForClearRef = useRef(contextKey);
  if (prevContextForClearRef.current !== contextKey) {
    prevContextForClearRef.current = contextKey;
    cancelLayout();
    setNodes([]);
    setEdges([]);
    setExpandingTableIds(clearExpandingTableIds);
    pendingExpansionRef.current = null;
  }

  useEffect(() => {
    if (shouldClearCanvas) {
      cancelLayout();
      setNodes([]);
      setEdges([]);
      setExpandingTableIds(clearExpandingTableIds);
      pendingExpansionRef.current = null;
    }
  }, [
    cancelLayout,
    setEdges,
    setExpandingTableIds,
    setNodes,
    shouldClearCanvas,
  ]);

  useEffect(() => {
    if (renderedGraph == null) {
      return;
    }

    const edges = markPendingEdgeSelected(
      renderedGraph.edges,
      pendingExpansionRef.current,
    );

    void requestLayout(
      {
        mode: "merge",
        incoming: renderedGraph.nodes,
        current: nodesRef.current,
        edges,
      },
      "graph-sync",
    ).then((outcome) => {
      if (outcome.status !== "success") {
        return;
      }

      setNodes(outcome.result.nodes);
      setEdges(edges);
      focusSyncedGraph({
        layout: outcome.result,
        pendingExpansionRef,
        zoomToNode,
        zoomToCanvas,
      });
      setExpandingTableIds((prev) =>
        getExpandingTableIds(prev, outcome.result.nodes),
      );
    });
  }, [
    nodesRef,
    renderedGraph,
    requestLayout,
    setEdges,
    setExpandingTableIds,
    setNodes,
    zoomToCanvas,
    zoomToNode,
  ]);

  return { registerPendingExpansion };
}
