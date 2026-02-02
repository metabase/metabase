import type { ErdEdge, ErdNode, ErdResponse } from "metabase-types/api";

import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from "./constants";
import type { ErdFlowEdge, ErdFlowNode } from "./types";

function getNodeId(node: ErdNode): string {
  return `table-${node.table_id}`;
}

function getNodeHeight(node: ErdNode): number {
  return HEADER_HEIGHT + node.fields.length * ROW_HEIGHT;
}

function toFlowNode(
  node: ErdNode,
  connectedFieldIds: Set<number>,
): ErdFlowNode {
  return {
    id: getNodeId(node),
    type: "erdTable",
    position: { x: 0, y: 0 },
    data: { ...node, connectedFieldIds },
    style: {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
    },
  };
}

function toFlowEdge(edge: ErdEdge): ErdFlowEdge {
  const isSelfRef = edge.source_table_id === edge.target_table_id;
  return {
    id: `edge-${edge.source_field_id}-${edge.target_field_id}`,
    source: `table-${edge.source_table_id}`,
    target: `table-${edge.target_table_id}`,
    sourceHandle: `field-${edge.source_field_id}`,
    targetHandle: isSelfRef
      ? `field-${edge.target_field_id}-right`
      : `field-${edge.target_field_id}`,
    type: "erdEdge",
    ...(isSelfRef && {
      markerEnd: {
        type: "arrowclosed" as const,
        color: "var(--mb-color-border)",
        width: 16,
        height: 16,
      },
    }),
  };
}

export function toFlowGraph(data: ErdResponse): {
  nodes: ErdFlowNode[];
  edges: ErdFlowEdge[];
} {
  // Build a map of table_id -> set of field IDs that have edges
  const connectedByTable = new Map<number, Set<number>>();
  for (const edge of data.edges) {
    if (!connectedByTable.has(edge.source_table_id)) {
      connectedByTable.set(edge.source_table_id, new Set());
    }
    if (!connectedByTable.has(edge.target_table_id)) {
      connectedByTable.set(edge.target_table_id, new Set());
    }
    connectedByTable.get(edge.source_table_id)!.add(edge.source_field_id);
    connectedByTable.get(edge.target_table_id)!.add(edge.target_field_id);
  }

  const emptySet = new Set<number>();
  return {
    nodes: data.nodes.map(node =>
      toFlowNode(node, connectedByTable.get(node.table_id) ?? emptySet),
    ),
    edges: data.edges.map(toFlowEdge),
  };
}

export function getFieldTypeBadge(
  databaseType: string,
  semanticType: string | null,
): { label: string; color: string } {
  if (semanticType === "type/PK" || semanticType === "PK") {
    return { label: "PK", color: "var(--mb-color-warning)" };
  }
  if (semanticType === "type/FK" || semanticType === "FK") {
    return { label: "FK", color: "var(--mb-color-focus)" };
  }

  const upper = databaseType.toUpperCase();
  if (
    upper.includes("INT") ||
    upper.includes("DECIMAL") ||
    upper.includes("FLOAT") ||
    upper.includes("DOUBLE") ||
    upper.includes("NUMERIC") ||
    upper.includes("BIGINT") ||
    upper.includes("REAL")
  ) {
    return { label: "123", color: "var(--mb-color-summarize)" };
  }
  if (
    upper.includes("DATE") ||
    upper.includes("TIME") ||
    upper.includes("TIMESTAMP")
  ) {
    return { label: "⏰", color: "var(--mb-color-filter)" };
  }
  if (upper.includes("BOOL") || upper.includes("BIT")) {
    return { label: "T/F", color: "var(--mb-color-accent4)" };
  }

  return { label: "A-Z", color: "var(--mb-color-brand)" };
}
