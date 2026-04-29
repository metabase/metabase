import { useCallback, useEffect, useRef } from "react";

import type { ConcreteTableId } from "metabase-types/api";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { mergeWithExistingPositions } from "../utils";

type UseGraphSyncArgs = {
  /** True once a databaseId has been picked — without it we render nothing. */
  hasEntry: boolean;
  /** RTK-Query error from useGetErdQuery. */
  error: unknown;
  /** RTK-Query isFetching from useGetErdQuery. */
  isFetching: boolean;
  /** Adapted graph (nodes + edges) for the current ERD response, or null. */
  graph: {
    nodes: SchemaViewerFlowNode[];
    edges: SchemaViewerFlowEdge[];
  } | null;
  /** Current nodes from useNodesState — needed for incremental position merge. */
  nodes: SchemaViewerFlowNode[];
  /** Stable key for the current (databaseId, schema). Drives the canvas reset. */
  contextKey: string | null;
  setNodes: (nodes: SchemaViewerFlowNode[]) => void;
  setEdges: (edges: SchemaViewerFlowEdge[]) => void;
  setExpandingTableIds: React.Dispatch<
    React.SetStateAction<Set<ConcreteTableId>>
  >;
  setPendingFitNodeIds: (nodeIds: readonly string[] | null) => void;
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
 *  - Auto-selects the FK edge that triggered an expansion once it shows up
 *    in the graph (caller registers candidate edge IDs via
 *    `registerPendingEdgeSelection`).
 *  - Clears in-flight expansion markers for tables that have arrived.
 *  - Queues a fitView on newly-added tables for incremental adds, so the
 *    camera pans to wherever they landed.
 */
export function useGraphSync({
  hasEntry,
  error,
  isFetching,
  graph,
  nodes,
  contextKey,
  setNodes,
  setEdges,
  setExpandingTableIds,
  setPendingFitNodeIds,
}: UseGraphSyncArgs) {
  // When the user expands a new table via FK click, these candidate IDs
  // hold the edge that should be auto-selected once the new graph arrives.
  // Stored as a ref (not state) so setting it doesn't trigger an extra
  // render — the sync effect just reads it on the next ERD response.
  const pendingEdgeIdsToSelectRef = useRef<readonly string[] | null>(null);

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
  const prevContextForClearRef = useRef(contextKey);
  useEffect(() => {
    if (prevContextForClearRef.current !== contextKey) {
      prevContextForClearRef.current = contextKey;
      setNodes([]);
      setEdges([]);
      setExpandingTableIds((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [contextKey, setNodes, setEdges, setExpandingTableIds]);

  useEffect(() => {
    if (!hasEntry || error != null) {
      setNodes([]);
      setEdges([]);
      setExpandingTableIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    if (isFetching || graph == null) {
      return;
    }

    // If we expanded via FK click and a matching edge has now arrived in
    // the new graph, mark it as selected — the existing edge-selection
    // plumbing (stroke color, node `.selected` class, z-index lift) will
    // light up the connecting edge AND both connected nodes automatically.
    let nextEdges: SchemaViewerFlowEdge[] = graph.edges;
    const pendingEdgeIds = pendingEdgeIdsToSelectRef.current;
    if (pendingEdgeIds != null) {
      const matchedId = pendingEdgeIds.find((candidate) =>
        graph.edges.some((e) => e.id === candidate),
      );
      if (matchedId != null) {
        nextEdges = graph.edges.map((e) =>
          e.id === matchedId ? { ...e, selected: true } : e,
        );
        pendingEdgeIdsToSelectRef.current = null;
      }
    }
    setEdges(nextEdges);

    // Merge incoming nodes with current positions so an incremental expansion
    // (e.g. clicking an FK to fetch a related table) doesn't blank the canvas
    // by replacing every node with a fresh opacity-0 copy. Falls back to the
    // fresh graph for first loads, schema switches, removals, or disconnected
    // new nodes — those still go through the normal Dagre relayout path.
    const currentNodes = nodesRef.current;
    const currentById = new Map(currentNodes.map((n) => [n.id, n]));
    const merged = mergeWithExistingPositions(
      graph.nodes,
      currentNodes,
      graph.edges,
    );

    const nextNodes = merged ?? graph.nodes;
    setNodes(nextNodes);

    // Clear any expand-in-flight markers for tables that just arrived in the
    // new graph (or that are no longer in the selection). FK field loaders
    // disappear automatically once their target table is visible.
    setExpandingTableIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const visibleIds = new Set(
        nextNodes.map((n) => n.data.table_id as ConcreteTableId),
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

    // If this was an incremental add (there was a current canvas and some of
    // it carried over), queue up a fitView on the newly-added tables so the
    // camera pans to wherever they landed.
    if (currentNodes.length > 0) {
      const addedIds = nextNodes
        .filter((n) => !currentById.has(n.id))
        .map((n) => n.id);
      if (addedIds.length > 0) {
        setPendingFitNodeIds(addedIds);
      }
    }
  }, [
    hasEntry,
    graph,
    error,
    isFetching,
    setNodes,
    setEdges,
    setExpandingTableIds,
    setPendingFitNodeIds,
  ]);

  /**
   * Register the candidate edge IDs that should be auto-selected once they
   * show up in the next ERD response. Both source-first and target-first
   * orderings should be passed since the backend's source/target convention
   * for edge IDs isn't fixed.
   */
  const registerPendingEdgeSelection = useCallback(
    (candidateEdgeIds: readonly string[]) => {
      if (candidateEdgeIds.length > 0) {
        pendingEdgeIdsToSelectRef.current = candidateEdgeIds;
      }
    },
    [],
  );

  return { registerPendingEdgeSelection };
}
