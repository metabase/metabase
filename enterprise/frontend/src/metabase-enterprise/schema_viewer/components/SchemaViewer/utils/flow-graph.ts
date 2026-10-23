import { Position } from "@xyflow/react";

import * as Lib from "metabase-lib";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  FieldId,
  TableId,
} from "metabase-types/api";

import { HEADER_HEIGHT_PX, NODE_WIDTH_PX, ROW_HEIGHT_PX } from "../constants";
import type {
  SchemaViewerFlowEdge,
  SchemaViewerFlowNode,
  SchemaViewerNodeHandle,
} from "../types";

type FlowGraph = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
};

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

type FieldRank = 0 | 1 | 2 | 3;

const LINKED_FOREIGN_KEY_RANK: FieldRank = 1;

/** PKs, then FKs with a known target table, then other FKs, then the rest. */
function getFieldRank(field: ErdField): FieldRank {
  const typeInfo = Lib.legacyColumnTypeInfo(field);
  if (Lib.isPrimaryKey(typeInfo)) {
    return 0;
  }
  if (Lib.isForeignKey(typeInfo)) {
    return field.fk_target_table_id != null ? LINKED_FOREIGN_KEY_RANK : 2;
  }
  return 3;
}

function sortFields(fields: ErdField[]): {
  fields: ErdField[];
  linkedForeignKeyRows: { start: number; count: number };
} {
  const ranked = fields
    .map((field) => ({ field, rank: getFieldRank(field) }))
    .sort((a, b) => a.rank - b.rank);
  const start = ranked.findIndex(
    ({ rank }) => rank === LINKED_FOREIGN_KEY_RANK,
  );
  const count = ranked.filter(
    ({ rank }) => rank === LINKED_FOREIGN_KEY_RANK,
  ).length;
  return {
    fields: ranked.map(({ field }) => field),
    linkedForeignKeyRows: { start: Math.max(start, 0), count },
  };
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
const HANDLE_SIZE_PX = 1;

function getFieldHandles(
  fields: readonly ErdField[],
  roles: TableEdgeRoles,
): SchemaViewerNodeHandle[] {
  const handles: SchemaViewerNodeHandle[] = [];
  const handleKeys = new Set<string>();

  const addHandle = (handle: SchemaViewerNodeHandle) => {
    const key = `${handle.type}:${handle.id}`;
    if (!handleKeys.has(key)) {
      handles.push(handle);
      handleKeys.add(key);
    }
  };

  fields.forEach((field, rowIndex) => {
    const y =
      HEADER_HEIGHT_PX +
      rowIndex * ROW_HEIGHT_PX +
      (ROW_HEIGHT_PX - HANDLE_SIZE_PX) / 2;
    const leftHandle = {
      x: -HANDLE_SIZE_PX / 2,
      y,
      width: HANDLE_SIZE_PX,
      height: HANDLE_SIZE_PX,
    };
    const rightHandle = {
      ...leftHandle,
      x: NODE_WIDTH_PX - HANDLE_SIZE_PX / 2,
    };

    if (roles.targetFieldIds.has(field.id)) {
      addHandle({
        ...leftHandle,
        id: getFieldHandleId(field.id),
        type: "target",
        position: Position.Left,
      });
    }
    if (roles.selfRefTargetFieldIds.has(field.id)) {
      addHandle({
        ...rightHandle,
        id: getFieldHandleId(field.id, "right"),
        type: "target",
        position: Position.Right,
      });
    }
    if (roles.sourceFieldIds.has(field.id)) {
      addHandle({
        ...rightHandle,
        id: getFieldHandleId(field.id),
        type: "source",
        position: Position.Right,
      });
    }
  });

  return handles;
}

function toFlowNode(
  node: ErdNode,
  roles: TableEdgeRoles,
): SchemaViewerFlowNode {
  const { fields, linkedForeignKeyRows } = sortFields(node.fields);
  const height = getNodeHeight(fields.length);
  const handles = getFieldHandles(fields, roles);
  const foreignKeyCount = fields.filter((field) =>
    Lib.isForeignKey(Lib.legacyColumnTypeInfo(field)),
  ).length;

  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH_PX,
    height,
    // Dimensions are fixed, so React Flow never needs to wait for a
    // ResizeObserver measurement before treating the node as initialized.
    measured: { width: NODE_WIDTH_PX, height },
    zIndex: NODE_Z_INDEX,
    data: {
      ...node,
      fields,
      handles,
      foreignKeyCount,
      linkedForeignKeyRows,
      selectedFieldIds: new Set(),
    },
    style: {
      width: NODE_WIDTH_PX,
      height,
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

function buildFlowGraph(data: ErdResponse): FlowGraph {
  // Per-table field roles: which fields act as source, target, or self-ref target
  // of any edge. Handles rendering is based on this (not on semantic_type) so an
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
}

/**
 * Keyed on the response object, not on a serialization of the whole schema.
 * RTK Query returns a stable reference per cache entry, so remounting the
 * viewer still hits, and the entry is released when the query cache drops the
 * response. Returning the identical graph matters beyond the compute it saves:
 * useGraphSync takes the graph as an effect dependency, and a fresh object
 * re-runs the layout and resets the viewport.
 */
const flowGraphs = new WeakMap<ErdResponse, FlowGraph>();

export function toFlowGraph(data: ErdResponse): FlowGraph {
  const cached = flowGraphs.get(data);
  if (cached !== undefined) {
    return cached;
  }

  const graph = buildFlowGraph(data);
  flowGraphs.set(data, graph);
  return graph;
}
