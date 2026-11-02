import type { Edge, Node } from "@xyflow/react";

export type SchemaViewerNodeHandle = NonNullable<Node["handles"]>[number] & {
  x: number;
  y: number;
  width: number;
  height: number;
};

import type { ErdNode, ErdRelationship, FieldId } from "metabase-types/api";

export type SchemaViewerNodeData = ErdNode & {
  // Fixed edge anchor geometry for every field that participates in an edge;
  // the edge layer draws edges from these without mounting the node.
  handles: SchemaViewerNodeHandle[];
  foreignKeyCount: number;
  // Rows of FK fields with a known target table, which render as links. They
  // are contiguous after the PK rows, so summary cards can tint them as one
  // block.
  linkedForeignKeyRows: { start: number; count: number };
  // Fields on this table that sit at either end of the currently selected
  // edge. Pre-computed at edge-click.
  selectedFieldIds: Set<FieldId>;
};
export type SchemaViewerFlowNode = Node<SchemaViewerNodeData>;

export type SchemaViewerEdgeData = {
  relationship: ErdRelationship;
};
export type SchemaViewerFlowEdge = Edge<SchemaViewerEdgeData>;
