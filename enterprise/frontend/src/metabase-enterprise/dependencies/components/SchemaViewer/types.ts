import type { Edge, Node } from "@xyflow/react";

import type { ErdNode } from "metabase-types/api";

export type SchemaViewerNodeData = ErdNode & {
  connectedFieldIds: Set<number>;
  [key: string]: unknown;
};
export type SchemaViewerFlowNode = Node<SchemaViewerNodeData>;
export type SchemaViewerFlowEdge = Edge;
