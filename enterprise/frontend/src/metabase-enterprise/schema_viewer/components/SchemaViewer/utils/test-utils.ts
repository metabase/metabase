import { HEADER_HEIGHT_PX, NODE_WIDTH_PX, ROW_HEIGHT_PX } from "../constants";
import type { SchemaViewerFlowNode } from "../types";

export type FlowNodeFieldSpec = { name: string; isFK?: boolean };

export type MakeFlowNodeOpts = {
  /** Numeric → `table-N`; string → used as-is. `data.table_id` is derived
   *  from the numeric form (digits-only when a string is passed). */
  id: number | string;
  /** Display name; defaults to the string form of `id`. */
  name?: string;
  /** Explicit fields. Takes precedence over `fieldCount`. */
  fields?: FlowNodeFieldSpec[];
  /** Generate N placeholder fields named `f1`, `f2`, …. Defaults to 0. */
  fieldCount?: number;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  opacity?: number;
};

export function makeFlowNode({
  id,
  name,
  fields,
  fieldCount,
  position = { x: 0, y: 0 },
  width = NODE_WIDTH_PX,
  height,
  opacity = 0,
}: MakeFlowNodeOpts): SchemaViewerFlowNode {
  const idString = typeof id === "number" ? `table-${id}` : id;
  const tableId =
    typeof id === "number" ? id : Number(id.replace(/\D/g, "")) || 1;
  const displayName = name ?? idString;

  const resolvedFields: FlowNodeFieldSpec[] =
    fields ??
    Array.from({ length: fieldCount ?? 0 }, (_, i) => ({
      name: `f${i + 1}`,
    }));

  const computedHeight =
    height ?? HEADER_HEIGHT_PX + resolvedFields.length * ROW_HEIGHT_PX;

  return {
    id: idString,
    type: "schemaViewerTable",
    position,
    data: {
      table_id: tableId,
      name: displayName,
      display_name: displayName,
      description: null,
      owner: null,
      schema: "public",
      visibility_type: null,
      db_id: 1,
      fields: resolvedFields.map((f, i) => ({
        id: i + 1,
        name: f.name,
        display_name: f.name,
        database_type: "text",
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: f.isFK ? "type/FK" : null,
        fk_target_field_id: null,
        fk_target_table_id: null,
      })),
      sourceFieldIds: new Set<number>(),
      targetFieldIds: new Set<number>(),
      selfRefTargetFieldIds: new Set<number>(),
      selectedFieldIds: new Set<number>(),
    },
    style: { width, height: computedHeight, opacity },
  };
}
