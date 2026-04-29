import { memoize } from "underscore";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  TableId,
} from "metabase-types/api";

import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

export function getNodeId(node: { table_id: TableId }): string {
  return `table-${node.table_id}`;
}

/** Pixel height of a table card given its field count. */
export function nodeHeight(fieldCount: number): number {
  return HEADER_HEIGHT + fieldCount * ROW_HEIGHT;
}

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

type TableEdgeRoles = {
  sourceFieldIds: Set<number>;
  targetFieldIds: Set<number>;
  selfRefTargetFieldIds: Set<number>;
};

const EMPTY_ROLES: TableEdgeRoles = {
  sourceFieldIds: new Set(),
  targetFieldIds: new Set(),
  selfRefTargetFieldIds: new Set(),
};

function toFlowNode(
  node: ErdNode,
  roles: TableEdgeRoles,
): SchemaViewerFlowNode {
  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    data: {
      ...node,
      fields: sortFields(node.fields),
      sourceFieldIds: roles.sourceFieldIds,
      targetFieldIds: roles.targetFieldIds,
      selfRefTargetFieldIds: roles.selfRefTargetFieldIds,
    },
    style: {
      width: NODE_WIDTH,
      height: nodeHeight(node.fields.length),
      opacity: 0, // Hide until positioned by dagre layout
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

function getFlowGraphMemoKey(data: ErdResponse): string {
  const nodeKey = data.nodes
    .map((node) => {
      const fieldKey = node.fields
        .map(
          (field) =>
            `${field.id}:${field.semantic_type ?? ""}:${field.fk_target_field_id ?? ""}`,
        )
        .join("|");
      return `${node.table_id}:${fieldKey}`;
    })
    .sort()
    .join(";");

  const edgeKey = data.edges
    .map(
      (edge) =>
        `${edge.source_table_id}:${edge.source_field_id}->${edge.target_table_id}:${edge.target_field_id}:${edge.relationship}`,
    )
    .sort()
    .join(";");

  return `${nodeKey}__${edgeKey}`;
}

const memoizedToFlowGraph = memoize((data: ErdResponse) => {
  // Per-table roles: which fields act as source, target, or self-ref target
  // of any edge. Handle rendering keys off this (not off semantic_type) so an
  // edge whose target field isn't tagged as a PK still gets a matching handle.
  const rolesByTable = new Map<TableId, TableEdgeRoles>();
  const ensureRoles = (tableId: TableId): TableEdgeRoles => {
    let roles = rolesByTable.get(tableId);
    if (roles == null) {
      roles = {
        sourceFieldIds: new Set(),
        targetFieldIds: new Set(),
        selfRefTargetFieldIds: new Set(),
      };
      rolesByTable.set(tableId, roles);
    }
    return roles;
  };
  for (const edge of data.edges) {
    ensureRoles(edge.source_table_id).sourceFieldIds.add(edge.source_field_id);
    const isSelfRef = edge.source_table_id === edge.target_table_id;
    const targetRoles = ensureRoles(edge.target_table_id);
    if (isSelfRef) {
      targetRoles.selfRefTargetFieldIds.add(edge.target_field_id);
    } else {
      targetRoles.targetFieldIds.add(edge.target_field_id);
    }
  }

  return {
    nodes: data.nodes.map((node) =>
      toFlowNode(node, rolesByTable.get(node.table_id) ?? EMPTY_ROLES),
    ),
    edges: data.edges.map((edge) => toFlowEdge(edge)),
  };
}, getFlowGraphMemoKey);

export function toFlowGraph(data: ErdResponse): {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
} {
  return memoizedToFlowGraph(data);
}
