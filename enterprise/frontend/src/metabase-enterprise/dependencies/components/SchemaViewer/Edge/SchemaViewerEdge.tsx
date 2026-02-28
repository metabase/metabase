import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import { useIsCompactMode } from "../SchemaViewerContext";
import type { SchemaViewerEdgeData } from "../types";

// Crow's foot geometry constants
const GAP = 4;
const W = 8;
const H = 6;

// Arrow geometry (centered triangle pointing right before rotation)
const ARROW_POINTS = "-6,-6 6,0 -6,6";

type SymbolType = "one" | "many";

interface SymbolProps {
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  scale?: number;
}

function OneSourceSymbol({ x, y, stroke, strokeWidth, scale = 1 }: SymbolProps) {
  const gap = GAP * scale;
  const h = H * scale;
  return (
    <line
      x1={x + gap}
      y1={y - h}
      x2={x + gap}
      y2={y + h}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManySourceSymbol({ x, y, stroke, strokeWidth, scale = 1 }: SymbolProps) {
  const gap = GAP * scale;
  const w = W * scale;
  const h = H * scale;
  return (
    <>
      <line
        x1={x + gap + w}
        y1={y}
        x2={x + gap}
        y2={y - h}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
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

function OneTargetSymbol({ x, y, stroke, strokeWidth, scale = 1 }: SymbolProps) {
  const gap = GAP * scale;
  const h = H * scale;
  return (
    <line
      x1={x - gap}
      y1={y - h}
      x2={x - gap}
      y2={y + h}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

function ManyTargetSymbol({ x, y, stroke, strokeWidth, scale = 1 }: SymbolProps) {
  const gap = GAP * scale;
  const w = W * scale;
  const h = H * scale;
  return (
    <>
      <line
        x1={x - gap - w}
        y1={y}
        x2={x - gap}
        y2={y - h}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
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

interface SymbolWrapperProps {
  type: SymbolType;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  scale?: number;
}

function SourceSymbol({ type, x, y, stroke, strokeWidth, scale }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManySourceSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} scale={scale} />
  ) : (
    <OneSourceSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} scale={scale} />
  );
}

function TargetSymbol({ type, x, y, stroke, strokeWidth, scale }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManyTargetSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} scale={scale} />
  ) : (
    <OneTargetSymbol x={x} y={y} stroke={stroke} strokeWidth={strokeWidth} scale={scale} />
  );
}

export const SchemaViewerEdge = memo(function SchemaViewerEdge(
  props: EdgeProps<SchemaViewerEdgeData>,
) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isCompactMode = useIsCompactMode();
  const isSelfRef = props.source === props.target;
  const isHidden = !isInitialized;
  const animationClass = "schema-viewer-edge-march";

  const relationship = props.data?.relationship ?? "many-to-one";
  const symbols = useMemo(() => getSymbolTypes(relationship), [relationship]);
  const stroke = palette["border"];
  const strokeWidth = isCompactMode ? 3 : 1.5;
  const scale = isCompactMode ? 2 : 1;

  const style = useMemo(
    () => ({
      strokeWidth,
      stroke,
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

  // Compute midpoint arrow position + angle from the rendered path
  const pathRef = useRef<SVGPathElement>(null);
  const [midArrow, setMidArrow] = useState<{
    x: number;
    y: number;
    angle: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el || isHidden) {
      setMidArrow(null);
      return;
    }
    const len = el.getTotalLength();
    const mid = el.getPointAtLength(len / 2);
    const ahead = el.getPointAtLength(Math.min(len / 2 + 1, len));
    const angle =
      Math.atan2(ahead.y - mid.y, ahead.x - mid.x) * (180 / Math.PI);
    setMidArrow({ x: mid.x, y: mid.y, angle });
  }, [edgePath, isHidden]);

  return (
    <>
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        style={style}
        className={`react-flow__edge-path ${animationClass}`}
      />
      {midArrow && (
        <polygon
          points={ARROW_POINTS}
          transform={`translate(${midArrow.x},${midArrow.y}) rotate(${midArrow.angle}) scale(${scale})`}
          fill={stroke}
        />
      )}
      {!isHidden && (
        <g>
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
