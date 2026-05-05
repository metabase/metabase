import type { ErdField } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from "../constants";
import type { SchemaViewerFlowNode } from "../types";

/**
 * Test-only fixtures for `SchemaViewerFlowNode`. Lives next to the production
 * code so layout helpers, edge geometry, and the React Flow node search can
 * share the same factory without each spec re-deriving the node shape.
 */

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
  width = NODE_WIDTH,
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
    height ?? HEADER_HEIGHT + resolvedFields.length * ROW_HEIGHT;

  return {
    id: idString,
    type: "schemaViewerTable",
    position,
    data: {
      table_id: tableId,
      name: displayName,
      display_name: displayName,
      schema: "public",
      db_id: 1,
      fields: resolvedFields.map((f, i): ErdField => {
        // Reuse createMockField's defaults for the keys ErdField shares
        // with the full Field type (name/display_name/database_type/
        // semantic_type/fk_target_field_id). `id` is narrowed back to a
        // number — Field.id is a wider FieldReference union — and
        // `fk_target_table_id` is ErdField-only.
        const base = createMockField({
          id: i + 1,
          name: f.name,
          display_name: f.name,
          database_type: "text",
          semantic_type: f.isFK ? "type/FK" : null,
        });
        return {
          id: i + 1,
          name: base.name,
          display_name: base.display_name,
          database_type: base.database_type,
          semantic_type: base.semantic_type,
          fk_target_field_id:
            typeof base.fk_target_field_id === "number"
              ? base.fk_target_field_id
              : null,
          fk_target_table_id: null,
        };
      }),
      sourceFieldIds: new Set<number>(),
      targetFieldIds: new Set<number>(),
      selfRefTargetFieldIds: new Set<number>(),
    },
    style: { width, height: computedHeight, opacity },
  };
}
