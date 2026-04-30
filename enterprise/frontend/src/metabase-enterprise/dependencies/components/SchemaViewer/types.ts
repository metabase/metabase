import type { Edge, Node } from "@xyflow/react";

import type { ErdNode, ErdRelationship } from "metabase-types/api";

export type SchemaViewerNodeData = ErdNode & {
  // Fields that act as the source side of some edge on this table.
  sourceFieldIds: Set<number>;
  // Fields that act as the target side of a non-self-referential edge.
  targetFieldIds: Set<number>;
  // Fields that act as the target side of a self-referential edge — they
  // render an extra handle on the right, since the matching source handle
  // also sits on the right of the same node.
  selfRefTargetFieldIds: Set<number>;
  [key: string]: unknown;
};
export type SchemaViewerFlowNode = Node<SchemaViewerNodeData>;

export type SchemaViewerEdgeData = {
  relationship: ErdRelationship;
  [key: string]: unknown;
};
export type SchemaViewerFlowEdge = Edge<SchemaViewerEdgeData>;

/**
 * Pending viewport operation. The sync/layout layer dispatches a
 * ViewportFitAction; SchemaViewer drains the resulting state via
 * `useEffect` once React Flow has committed the corresponding node /
 * position changes.
 *
 *  - `kind: "all"` — fit the whole canvas via ReactFlow's `fitView`. Used
 *    after fresh layouts (first load, schema switch, manual auto-layout).
 *    Allows zoom to drop below the per-node-fit floor for wide schemas.
 *  - `kind: "nodes"` — pan/zoom to a subset using `zoomToNodes` rules
 *    (≥0.5 zoom, header pinned near the top). Used for FK expansions, edge
 *    double-click, and the focus-node action.
 */
export type PendingViewportFit =
  | { kind: "all" }
  | { kind: "nodes"; nodeIds: readonly string[] };

export type ViewportFitAction =
  | { type: "fitAll" }
  | { type: "fitNodes"; nodeIds: readonly string[] }
  | { type: "clear" };
