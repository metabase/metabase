import type { SchemaViewerFlowNode } from "../types";

import {
  applyDagrePositions,
  getDagreLayoutRequest,
  getDagrePositions,
} from "./layout/dagre-layout";
import { prepareFocusNodeLayout } from "./layout/focal-layout";
import { mergeWithExistingPositions } from "./layout/incremental-layout";
import type {
  DagreLayoutRequest,
  DagreNodePosition,
  LayoutEdge,
} from "./layout/types";

export { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./layout/constants";
export type { LayoutEdge } from "./layout/types";

/**
 * Layout request shape consumed by {@link applyLayout}. Three modes cover the
 * full set of canvas-layout actions in the schema viewer:
 *
 *  - `fresh`: lay everything out from scratch via Dagre (manual auto-layout
 *    button, or fallback when an incremental merge isn't possible).
 *  - `focus`: rearrange around "focal table" — incoming relationships stack on
 *    the left, outgoing on the right, and the remaining side cluster uses
 *    Dagre.
 *  - `merge`: try to preserve existing positions when the underlying graph
 *    changes incrementally (e.g. FK click adds a new table).
 */
export type LayoutRequest =
  | {
      mode: "fresh";
      nodes: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    }
  | {
      mode: "focus";
      focalId: string;
      nodes: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    }
  | {
      mode: "merge";
      incoming: SchemaViewerFlowNode[];
      current: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    };

export type LayoutResult = {
  nodes: SchemaViewerFlowNode[];
  // Indicate whether node positions were preserved during incremental merge.
  preservedExistingPositions: boolean;
};

export type PreparedLayout =
  | { kind: "complete"; result: LayoutResult }
  | {
      kind: "dagre";
      graph: DagreLayoutRequest;
      complete: (positions: readonly DagreNodePosition[]) => LayoutResult;
    };

function prepareFreshLayout(
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): PreparedLayout {
  return {
    kind: "dagre",
    graph: getDagreLayoutRequest(nodes, edges),
    complete: (positions) => ({
      nodes: applyDagrePositions(nodes, positions),
      preservedExistingPositions: false,
    }),
  };
}

/**
 * Resolves all synchronous placement work and returns only the Dagre portion,
 * if any, for the asynchronous coordinator.
 */
export function prepareLayout(request: LayoutRequest): PreparedLayout {
  switch (request.mode) {
    case "fresh":
      return prepareFreshLayout(request.nodes, request.edges);
    case "focus": {
      const prepared = prepareFocusNodeLayout(
        request.focalId,
        request.nodes,
        request.edges,
      );
      return prepared.kind === "complete"
        ? {
            kind: "complete",
            result: {
              nodes: prepared.nodes,
              preservedExistingPositions: false,
            },
          }
        : {
            kind: "dagre",
            graph: prepared.graph,
            complete: (positions) => ({
              nodes: prepared.complete(positions),
              preservedExistingPositions: false,
            }),
          };
    }
    case "merge": {
      const merged = mergeWithExistingPositions(
        request.incoming,
        request.current,
        request.edges,
      );
      return merged == null
        ? prepareFreshLayout(request.incoming, request.edges)
        : {
            kind: "complete",
            result: { nodes: merged, preservedExistingPositions: true },
          };
    }
  }
}

export function completeLayoutSynchronously(
  prepared: PreparedLayout,
): LayoutResult {
  return prepared.kind === "complete"
    ? prepared.result
    : prepared.complete(getDagrePositions(prepared.graph));
}

/** Synchronous composition retained for fallback and pure layout tests. */
export function applyLayout(request: LayoutRequest): LayoutResult {
  return completeLayoutSynchronously(prepareLayout(request));
}
