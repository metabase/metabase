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
