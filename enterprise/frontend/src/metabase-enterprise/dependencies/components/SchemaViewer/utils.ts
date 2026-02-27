import dagre from "@dagrejs/dagre";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  TableId,
} from "metabase-types/api";

import {
  COMPACT_NODE_HEIGHT,
  DAGRE_NODE_SEP,
  DAGRE_RANK_SEP,
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
} from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";

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

export function getNodeId(node: { table_id: TableId }): string {
  return `table-${node.table_id}`;
}

function getNodeHeight(node: ErdNode): number {
  return HEADER_HEIGHT + node.fields.length * ROW_HEIGHT;
}

function toFlowNode(
  node: ErdNode,
  connectedFieldIds: Set<number>,
): SchemaViewerFlowNode {
  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    data: { ...node, fields: sortFields(node.fields), connectedFieldIds },
    style: {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
    },
  };
}

function toFlowEdge(edge: ErdEdge): SchemaViewerFlowEdge {
  const isSelfRef = edge.source_table_id === edge.target_table_id;
  return {
    id: `edge-${edge.source_field_id}-${edge.target_field_id}`,
    source: `table-${edge.source_table_id}`,
    target: `table-${edge.target_table_id}`,
    sourceHandle: `field-${edge.source_field_id}`,
    targetHandle: isSelfRef
      ? `field-${edge.target_field_id}-right`
      : `field-${edge.target_field_id}`,
    type: "schemaViewerEdge",
    data: {
      relationship: edge.relationship,
    },
  };
}

export function toFlowGraph(data: ErdResponse): {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
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
    edges: data.edges.map((edge) => toFlowEdge(edge)),
  };
}

function getLayoutNodeHeight(
  node: SchemaViewerFlowNode,
  isCompactMode: boolean,
): number {
  if (isCompactMode) {
    return COMPACT_NODE_HEIGHT;
  }
  const fieldCount = node.data.fields?.length ?? 0;
  return HEADER_HEIGHT + fieldCount * ROW_HEIGHT;
}

export function getNodesWithPositions(
  nodes: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
  isCompactMode: boolean,
): SchemaViewerFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP,
    ranksep: DAGRE_RANK_SEP,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const height = getLayoutNodeHeight(node, isCompactMode);
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const { x, y, width, height } = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
    };
  });
}
