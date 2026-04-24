import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData, SchemaViewerFlowEdge } from "../types";

// Crow's foot geometry constants
const GAP = 4;
const W = 8;
const H = 6;

type SymbolType = "one" | "many";

type SymbolProps = {
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  scale?: number;
};

function OneSourceSymbol({
  x,
  y,
  stroke,
  strokeWidth,
  scale = 1,
}: SymbolProps) {
  const gap = GAP * scale;
  const h = H * scale;
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x + gap}
      y1={y - h}
      x2={x + gap}
      y2={y + h}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManySourceSymbol({
  x,
  y,
  stroke,
  strokeWidth,
  scale = 1,
}: SymbolProps) {
  const gap = GAP * scale;
  const w = W * scale;
  const h = H * scale;
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + gap + w}
        y1={y}
        x2={x + gap}
        y2={y - h}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + gap + w}
        y1={y}
        x2={x + gap}
        y2={y + h}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </>
  );
}

function OneTargetSymbol({
  x,
  y,
  stroke,
  strokeWidth,
  scale = 1,
}: SymbolProps) {
  const gap = GAP * scale;
  const h = H * scale;
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x - gap}
      y1={y - h}
      x2={x - gap}
      y2={y + h}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManyTargetSymbol({
  x,
  y,
  stroke,
  strokeWidth,
  scale = 1,
}: SymbolProps) {
  const gap = GAP * scale;
  const w = W * scale;
  const h = H * scale;
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - gap - w}
        y1={y}
        x2={x - gap}
        y2={y - h}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - gap - w}
        y1={y}
        x2={x - gap}
        y2={y + h}
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

type SymbolWrapperProps = {
  type: SymbolType;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  scale?: number;
};

function SourceSymbol({
  type,
  x,
  y,
  stroke,
  strokeWidth,
  scale,
}: SymbolWrapperProps) {
  return type === "many" ? (
    <ManySourceSymbol
      x={x}
      y={y}
      stroke={stroke}
      strokeWidth={strokeWidth}
      scale={scale}
    />
  ) : (
    <OneSourceSymbol
      x={x}
      y={y}
      stroke={stroke}
      strokeWidth={strokeWidth}
      scale={scale}
    />
  );
}

function TargetSymbol({
  type,
  x,
  y,
  stroke,
  strokeWidth,
  scale,
}: SymbolWrapperProps) {
  return type === "many" ? (
    <ManyTargetSymbol
      x={x}
      y={y}
      stroke={stroke}
      strokeWidth={strokeWidth}
      scale={scale}
    />
  ) : (
    <OneTargetSymbol
      x={x}
      y={y}
      stroke={stroke}
      strokeWidth={strokeWidth}
      scale={scale}
    />
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
    : (palette["border"] ?? "currentColor");
  const strokeWidth = selected ? 2 : 1;
  const scale = 1;

  const style = useMemo(
    () => ({
      strokeWidth,
      stroke,
      strokeDasharray: "9 9",
      ...(isHidden ? { visibility: "hidden" as const } : {}),
    }),
    [stroke, strokeWidth, isHidden],
  );

  // Compute edge path for both branches so hooks stay unconditional
  let edgePath: string;

  if (isSelfRef) {
    const { sourceX, sourceY, targetX, targetY } = props;
    const offset = 50;
    const r = 8;
    const midX = Math.max(sourceX, targetX) + offset;

    edgePath = [
      `M ${sourceX} ${sourceY}`,
      `L ${midX - r} ${sourceY}`,
      `Q ${midX} ${sourceY} ${midX} ${sourceY + (sourceY < targetY ? r : -r)}`,
      `L ${midX} ${targetY + (sourceY < targetY ? -r : r)}`,
      `Q ${midX} ${targetY} ${midX - r} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(" ");
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
        className="react-flow__edge-interaction"
      />
      <path
        data-testid="schema-viewer-edge-path"
        d={edgePath}
        fill="none"
        style={style}
        className="react-flow__edge-path"
      />
      {!isHidden && (
        <g data-testid="schema-viewer-edge-symbols">
          <SourceSymbol
            type={symbols.source}
            x={props.sourceX}
            y={props.sourceY}
            stroke={stroke}
            strokeWidth={strokeWidth}
            scale={scale}
          />
          {isSelfRef ? (
            <SourceSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
              strokeWidth={strokeWidth}
              scale={scale}
            />
          ) : (
            <TargetSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
              strokeWidth={strokeWidth}
              scale={scale}
            />
          )}
        </g>
      )}
    </>
  );
});
