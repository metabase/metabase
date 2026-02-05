import type { EdgeMarker } from "@xyflow/react";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  TableId,
} from "metabase-types/api";

import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from "./constants";
import type { ErdFlowEdge, ErdFlowNode } from "./types";

function sortFields(fields: ErdField[]): ErdField[] {
  return [...fields].sort((a, b) => {
    const aPK = isTypePK(a.semantic_type);
    const bPK = isTypePK(b.semantic_type);
    const aFK = isTypeFK(a.semantic_type);
    const bFK = isTypeFK(b.semantic_type);

    // PK first
    if (aPK && !bPK) {
      return -1;
    }
    if (!aPK && bPK) {
      return 1;
    }
    // FK second
    if (aFK && !bFK) {
      return -1;
    }
    if (!aFK && bFK) {
      return 1;
    }
    // Keep original order for same category
    return 0;
  });
}

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
    data: { ...node, fields: sortFields(node.fields), connectedFieldIds },
    style: {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
    },
  };
}

function toFlowEdge(edge: ErdEdge, markerEnd: EdgeMarker): ErdFlowEdge {
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
    markerEnd,
  };
}

export function toFlowGraph(
  data: ErdResponse,
  markerEnd: EdgeMarker,
): {
  nodes: ErdFlowNode[];
  edges: ErdFlowEdge[];
} {
  // Build a map of table_id -> set of field IDs that have edges
  const connectedByTable = new Map<TableId, Set<number>>();
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
    nodes: data.nodes.map((node) =>
      toFlowNode(node, connectedByTable.get(node.table_id) ?? emptySet),
    ),
    edges: data.edges.map((edge) => toFlowEdge(edge, markerEnd)),
  };
}
