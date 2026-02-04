import type { Edge, Node } from "@xyflow/react";

import type { ErdNode } from "metabase-types/api";

export type ErdNodeData = ErdNode & {
  connectedFieldIds: Set<number>;
  [key: string]: unknown;
};
export type ErdFlowNode = Node<ErdNodeData>;

export type ErdEdgeData = {
  /** True if edge flows away from focal node (focal is source) */
  flowsFromFocal: boolean;
};
export type ErdFlowEdge = Edge<ErdEdgeData>;
