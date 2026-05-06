import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";

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

/**
 * Owns the data → React Flow state sync for the schema viewer:
 *
 *  - Clears the canvas immediately on context change (database/schema swap)
 *    so the previous schema's nodes don't linger until the new fetch
 *    resolves.
 *  - When a fresh ERD response arrives: merges incoming nodes with the
 *    current canvas to preserve positions of tables that were already
 *    placed, falling back to a fresh Dagre layout for first loads, schema
 *    switches, removals, or disconnected new nodes.
 *  - On FK expansion: once the new graph arrives, auto-selects the FK edge
 *    that triggered the expansion (caller registers via
 *    `registerPendingExpansion`) AND zooms onto the new target table.
 *  - Clears in-flight expansion markers for tables that have arrived.
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
  // Latest registered expansion (from FK click). Fresh registrations overwrite the previous
  // one — if the user expands several FKs in quick succession, we follow
  // the most recent click.
  const pendingExpansionRef = useRef<PendingExpansion | null>(null);

  /**
   * Register the FK-expansion target. Once the next ERD response includes
   * a node for `targetTableId`, graph sync auto-selects the connecting
   * edge (from `candidateEdgeIds`) and zooms onto that node.
   *
   * `candidateEdgeIds` should include both source-first and target-first
   * orderings since the backend's source/target convention isn't fixed.
   */
  const registerPendingExpansion = useCallback(
    (targetTableId: ConcreteTableId, candidateEdgeIds?: readonly string[]) => {
      pendingExpansionRef.current = {
        targetNodeId: getNodeId({ table_id: targetTableId }),
        candidateEdgeIds: candidateEdgeIds ?? [],
      };
    },
    [],
  );

  // Latest nodes held in a ref so the sync effect below can read current
  // state without adding `nodes` to its dependency array (which would cause
  // the effect to re-run on every internal React Flow node change — like
  // drags or position tweaks — and incorrectly re-merge against the result
  // of its own previous run).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

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
    setExpandingTableIds((prev) => (prev.size === 0 ? prev : new Set()));
    pendingExpansionRef.current = null;
  }

  useEffect(() => {
    if (!hasDbSelected || error != null) {
      setNodes([]);
      setEdges([]);
      setExpandingTableIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    if (isFetching || graph == null) {
      return;
    }

    // If we expanded via FK click and a matching edge has now arrived in
    // the new graph, mark it as selected.
    let nextEdges: SchemaViewerFlowEdge[] = graph.edges;
    const pending = pendingExpansionRef.current;
    if (pending != null && pending.candidateEdgeIds.length > 0) {
      const matchedId = pending.candidateEdgeIds.find((candidate) =>
        graph.edges.some((e) => e.id === candidate),
      );
      if (matchedId != null) {
        nextEdges = graph.edges.map((e) =>
          e.id === matchedId ? { ...e, selected: true } : e,
        );
      }
    }
    setEdges(nextEdges);

    // Merge incoming nodes with current already-positioned nodes..
    const currentNodes = nodesRef.current;
    const layout = applyLayout({
      mode: "merge",
      incoming: graph.nodes,
      current: currentNodes,
      edges: graph.edges,
    });
    const nextNodes = layout.nodes;
    setNodes(nextNodes);

    // Clear any expand-in-flight markers for tables that just arrived in the
    // new graph (or that are no longer in the selection). FK field loaders
    // disappear automatically once their target table is visible.
    setExpandingTableIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const visibleIds = new Set(
        nextNodes.map((n) => n.data.table_id),
      );
      let changed = false;
      const next = new Set<ConcreteTableId>();
      for (const id of prev) {
        if (visibleIds.has(id)) {
          changed = true;
        } else {
          next.add(id);
        }
      }
      return changed ? next : prev;
    });

    if (layout.preservedExistingPositions) {
      // Incremental add: zoom onto the user-clicked target if it's now in
      // the graph. We skip the zoom for any other added tables (e.g. ones
      // the backend brings in alongside) — only the clicked one is the
      // user's focal intent.
      if (
        pending != null &&
        nextNodes.some((n) => n.id === pending.targetNodeId)
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
  }, [
    hasDbSelected,
    graph,
    error,
    isFetching,
    setNodes,
    setEdges,
    setExpandingTableIds,
    zoomToNode,
    zoomToCanvas,
  ]);

  return { registerPendingExpansion };
}
