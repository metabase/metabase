import { memoize } from "underscore";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  FieldId,
  TableId,
} from "metabase-types/api";

import { HEADER_HEIGHT_PX, NODE_WIDTH_PX, ROW_HEIGHT_PX } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

export function getNodeId(node: { table_id: TableId } | TableId): string {
  const tableId = typeof node === "object" ? node.table_id : node;
  return `table-${tableId}`;
}

export function getEdgeId(
  sourceFieldId: FieldId,
  targetFieldId: FieldId,
): string {
  return `edge-${sourceFieldId}-${targetFieldId}`;
}

// `side` distinguishes the right-side * handle used to anchor self-referential edges.
export function getFieldHandleId(fieldId: FieldId, side?: "right"): string {
  return side ? `field-${fieldId}-${side}` : `field-${fieldId}`;
}

export function getNodeHeight(fieldCount: number): number {
  return HEADER_HEIGHT_PX + fieldCount * ROW_HEIGHT_PX;
}

// Sort fields so PKs come first, then FKs, then the rest
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

// Nodes should sit above all edges and have higher z-index, but it should be provided
// here (not from CSS), because otherwise React Flow inlines it with "0" value (even when
// set to `null`).
const NODE_Z_INDEX = 2;

function toFlowNode(
  node: ErdNode,
  roles: TableEdgeRoles,
): SchemaViewerFlowNode {
  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    zIndex: NODE_Z_INDEX,
    data: {
      ...node,
      fields: sortFields(node.fields),
      sourceFieldIds: roles.sourceFieldIds,
      targetFieldIds: roles.targetFieldIds,
      selfRefTargetFieldIds: roles.selfRefTargetFieldIds,
    },
    style: {
      width: NODE_WIDTH_PX,
      height: getNodeHeight(node.fields.length),
      opacity: 0, // Hide until positioned by dagre layout
    },
  };
}

function toFlowEdge(edge: ErdEdge): SchemaViewerFlowEdge {
  const isSelfRef = edge.source_table_id === edge.target_table_id;
  return {
    id: getEdgeId(edge.source_field_id, edge.target_field_id),
    source: getNodeId(edge.source_table_id),
    target: getNodeId(edge.target_table_id),
    sourceHandle: getFieldHandleId(edge.source_field_id),
    targetHandle: getFieldHandleId(
      edge.target_field_id,
      isSelfRef ? "right" : undefined,
    ),
    type: "schemaViewerEdge",
    // @ts-expect-error - without providing null here, ReactFlow inlines it as 0.
    zIndex: null,
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
  // Per-table field roles: which fields act as source, target, or self-ref target
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
