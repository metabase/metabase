import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useLatest } from "react-use";

import type { ConcreteTableId } from "metabase-types/api";

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
  // Stable key for the current (databaseId, schema). Drives the canvas reset.
  contextKey: string | null;
  setNodes: (nodes: SchemaViewerFlowNode[]) => void;
  setEdges: (edges: SchemaViewerFlowEdge[]) => void;
  setExpandingTableIds: Dispatch<SetStateAction<Set<ConcreteTableId>>>;
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
};

type PendingExpansion = {
  // Node ID of the table the user expanded into — zoom target.
  targetNodeId: string;
  // Candidate edge IDs to auto-select (both possible orderings).
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
    // Incremental add: zoom onto the user-clicked target if it's now in
    // the graph. We skip the zoom for any other added tables (e.g. ones
    // the backend brings in alongside) — only the clicked one is the
    // user's focal intent.
    if (
      pending != null &&
      layout.nodes.some((node) => node.id === pending.targetNodeId)
    ) {
      zoomToNode(pending.targetNodeId);
      pendingExpansionRef.current = null;
    }
  } else {
    // Fresh layout: fit the whole canvas (uses ReactFlow's default fitView
    // bounds, so wide schemas can zoom out below the per-node-fit floor).
    zoomToCanvas();
    pendingExpansionRef.current = null;
  }
}

/**
 * Owns the data → React Flow state sync for the schema viewer:
 *
 *  - Clears the canvas immediately on context change (database/schema swap)
 *    so the previous schema's nodes don't linger until the new fetch
 *    resolves.
 *  - When a fresh ERD response arrives: merges incoming nodes (`graph`) with the
 *    current canvas to preserve positions of tables that were already
 *    placed, falling back to a fresh Dagre layout for first loads, schema
 *    switches, removals, or disconnected new nodes.
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

  // Clear the canvas whenever the database/schema context changes, regardless
  // of how it was changed (picker click, direct URL navigation, history
  // back/forward). Without this, the previous schema's nodes linger on screen
  // until the new fetch resolves and the sync effect replaces them.
  // Done as an in-render reset (not an effect) so the canvas clears on the
  // same paint as the context change — no flash of old nodes under the new
  // schema picker label.
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
    // new graph (or that are no longer in the selection). FK field loaders
    // disappear automatically once their target table is visible.
    setExpandingTableIds((prev) =>
      getExpandingTableIds(prev, renderedGraph.nodes),
    );
  }, [renderedGraph, setExpandingTableIds]);

  return { registerPendingExpansion };
}
