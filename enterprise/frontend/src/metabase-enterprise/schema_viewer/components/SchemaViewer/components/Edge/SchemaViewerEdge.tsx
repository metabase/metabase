import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData, SchemaViewerFlowEdge } from "../../types";

// Crow's foot (many-to-one symbol) geometry constants
const GAP = 4;
const W = 8;
const H = 6;

/**
 * Build an SVG path that loops from a source handle on the right side of a
 * table around to a target handle on the same table. The two endpoints share
 * an x coordinate (the right edge of the table); the path bows out to the
 * right by `SELF_REF_OFFSET` pixels.
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

type SymbolType = "one" | "many";

type SymbolProps = {
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
};

function OneSourceSymbol({ x, y, stroke, strokeWidth }: SymbolProps) {
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x + GAP}
      y1={y - H}
      x2={x + GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManySourceSymbol({ x, y, stroke, strokeWidth }: SymbolProps) {
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </>
  );
}

function OneTargetSymbol({ x, y, stroke, strokeWidth }: SymbolProps) {
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x - GAP}
      y1={y - H}
      x2={x - GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManyTargetSymbol({ x, y, stroke, strokeWidth }: SymbolProps) {
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </>
  );
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

type SymbolWrapperProps = SymbolProps & {
  type: SymbolType;
};

function SourceSymbol({ type, x, y, stroke, strokeWidth }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManySourceSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} />
  ) : (
    <OneSourceSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} />
  );
}

function TargetSymbol({ type, x, y, stroke, strokeWidth }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManyTargetSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} />
  ) : (
    <OneTargetSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} />
  );
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
    ? (palette["brand"] ?? "var(--mb-color-brand)")
    : (palette["border"] ?? "var(--mb-color-border)");
  const strokeWidth = selected ? 2 : 1;

  const style = useMemo(
    () => ({
      strokeWidth,
      stroke,
      strokeDasharray: "9 9",
      ...(isHidden ? { visibility: "hidden" as const } : {}),
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
        d={edgePath}
        fill="none"
        style={style}
      />
      {!isHidden && (
        <g data-testid="schema-viewer-edge-symbols">
          <SourceSymbol
            type={symbols.source}
            x={props.sourceX}
            y={props.sourceY}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {isSelfRef ? (
            <SourceSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          ) : (
            <TargetSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          )}
        </g>
      )}
    </>
  );
});
