import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import type { CSSProperties } from "react";
import { memo, useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData, SchemaViewerFlowEdge } from "../../types";

import { EdgeSymbol, type SymbolType } from "./EdgeSymbol";

/**
 * Builds an SVG path that loops from a source handle on the right side of a
 * table around to a target handle on the same table.
 */
const SELF_REF_OFFSET = 50;
const SELF_REF_RADIUS = 8;
export function getSelfRefEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}): string {
  const midX = Math.max(sourceX, targetX) + SELF_REF_OFFSET;
  const r = SELF_REF_RADIUS;
  const sourceTurn = sourceY < targetY ? r : -r;
  const targetTurn = sourceY < targetY ? -r : r;
  return [
    `M ${sourceX} ${sourceY}`,
    `L ${midX - r} ${sourceY}`,
    `Q ${midX} ${sourceY} ${midX} ${sourceY + sourceTurn}`,
    `L ${midX} ${targetY + targetTurn}`,
    `Q ${midX} ${targetY} ${midX - r} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

function getSymbolTypes(relationship: SchemaViewerEdgeData["relationship"]): {
  source: SymbolType;
  target: SymbolType;
} {
  if (relationship === "one-to-one") {
    return { source: "one", target: "one" };
  }
  return { source: "many", target: "one" };
}

export const SchemaViewerEdge = memo(function SchemaViewerEdge(
  props: EdgeProps<SchemaViewerFlowEdge>,
) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const isHidden = !isInitialized;
  const selected = props.selected ?? false;

  const relationship = props.data?.relationship ?? "many-to-one";
  const symbols = useMemo(() => getSymbolTypes(relationship), [relationship]);
  const stroke = selected
    ? (palette.brand ?? "var(--mb-color-core-brand)")
    : (palette["border-neutral-strong"] ??
      "var(--mb-color-border-neutral-strong)");
  const strokeWidth = selected ? 2 : 1;

  const style: CSSProperties = useMemo(
    () => ({
      strokeWidth,
      stroke,
      strokeDasharray: "9 9",
      visibility: isHidden ? "hidden" : undefined,
    }),
    [stroke, strokeWidth, isHidden],
  );

  let edgePath: string;

  if (isSelfRef) {
    edgePath = getSelfRefEdgePath({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      targetX: props.targetX,
      targetY: props.targetY,
    });
  } else {
    [edgePath] = getSmoothStepPath({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    });
  }

  return (
    <>
      {/* Invisible wide hit-area path so clicks on thin edges are easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={isHidden ? { visibility: "hidden" as const } : undefined}
      />
      <path
        data-testid="schema-viewer-edge-path"
        data-selected={selected ? "true" : undefined}
        d={edgePath}
        fill="none"
        style={style}
      />
      {!isHidden && (
        <g data-testid="schema-viewer-edge-symbols">
          <EdgeSymbol
            side="source"
            type={symbols.source}
            x={props.sourceX}
            y={props.sourceY}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <EdgeSymbol
            side={isSelfRef ? "source" : "target"}
            type={symbols.target}
            x={props.targetX}
            y={props.targetY}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </g>
      )}
    </>
  );
});
