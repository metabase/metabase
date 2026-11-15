import type { SchemaViewerFlowNode } from "../types";

import { layoutWithDagre } from "./layout/dagre-layout";
import { focusNodeLayout } from "./layout/focal-layout";
import { mergeWithExistingPositions } from "./layout/incremental-layout";
import type { LayoutEdge } from "./layout/types";

export { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./layout/constants";
export type { LayoutEdge } from "./layout/types";

/**
 * Layout request shape consumed by {@link applyLayout}. Three modes cover the
 * full set of canvas-layout actions in the schema viewer:
 *
 *  - `fresh`: lay everything out from scratch via Dagre (manual auto-layout
 *    button, or fallback when an incremental merge isn't possible).
 *  - `focus`: rearrange around "focal table" — incoming relationships stack on the
 *    left, outgoing on the right, the rest are placed further on the side using default algorithm.
 *  - `merge`: try to preserve existing positions when the underlying graph
 *    changes incrementally (e.g. FK click adds a new table).
 * */
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

/**
 * Organize canvas layout based on the requested mode.
 */
export function applyLayout(req: LayoutRequest): LayoutResult {
  switch (req.mode) {
    case "fresh":
      return {
        nodes: layoutWithDagre(req.nodes, req.edges),
        preservedExistingPositions: false,
      };
    case "focus":
      return {
        nodes: focusNodeLayout(req.focalId, req.nodes, req.edges),
        preservedExistingPositions: false,
      };
    case "merge": {
      const merged = mergeWithExistingPositions(
        req.incoming,
        req.current,
        req.edges,
      );
      if (merged != null) {
        return { nodes: merged, preservedExistingPositions: true };
      }
      return applyLayout({
        nodes: req.incoming,
        edges: req.edges,
        mode: "fresh",
      });
    }
  }
}
