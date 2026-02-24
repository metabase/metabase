import type { Edge, Node } from "@xyflow/react";

import type { ErdNode, ErdRelationship } from "metabase-types/api";

export type SchemaViewerNodeData = ErdNode & {
  connectedFieldIds: Set<number>;
  [key: string]: unknown;
};
export type SchemaViewerFlowNode = Node<SchemaViewerNodeData>;

export type SchemaViewerEdgeData = {
  relationship: ErdRelationship;
  [key: string]: unknown;
};
export type SchemaViewerFlowEdge = Edge<SchemaViewerEdgeData>;
