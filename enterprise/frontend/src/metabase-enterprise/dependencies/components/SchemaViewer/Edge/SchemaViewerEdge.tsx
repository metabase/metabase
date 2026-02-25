import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData } from "../types";

// Crow's foot geometry constants
const GAP = 4;
const W = 8;
const H = 6;

// Arrow geometry (centered triangle pointing right before rotation)
const ARROW_POINTS = "-6,-6 6,0 -6,6";

type SymbolType = "one" | "many";

function OneSourceSymbol({
  x,
  y,
  stroke,
}: {
  x: number;
  y: number;
  stroke: string;
}) {
  return (
    <line
      x1={x + GAP}
      y1={y - H}
      x2={x + GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function ManySourceSymbol({
  x,
  y,
  stroke,
}: {
  x: number;
  y: number;
  stroke: string;
}) {
  return (
    <>
      <line
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <line
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </>
  );
}

function OneTargetSymbol({
  x,
  y,
  stroke,
}: {
  x: number;
  y: number;
  stroke: string;
}) {
  return (
    <line
      x1={x - GAP}
      y1={y - H}
      x2={x - GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function ManyTargetSymbol({
  x,
  y,
  stroke,
}: {
  x: number;
  y: number;
  stroke: string;
}) {
  return (
    <>
      <line
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <line
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={1.5}
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

function SourceSymbol({
  type,
  x,
  y,
  stroke,
}: {
  type: SymbolType;
  x: number;
  y: number;
  stroke: string;
}) {
  return type === "many" ? (
    <ManySourceSymbol x={x} y={y} stroke={stroke} />
  ) : (
    <OneSourceSymbol x={x} y={y} stroke={stroke} />
  );
}

function TargetSymbol({
  type,
  x,
  y,
  stroke,
}: {
  type: SymbolType;
  x: number;
  y: number;
  stroke: string;
}) {
  return type === "many" ? (
    <ManyTargetSymbol x={x} y={y} stroke={stroke} />
  ) : (
    <OneTargetSymbol x={x} y={y} stroke={stroke} />
  );
}

export const SchemaViewerEdge = memo(function SchemaViewerEdge(
  props: EdgeProps<SchemaViewerEdgeData>,
) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const isHidden = !isInitialized;
  const animationClass = "schema-viewer-edge-march";

  const relationship = props.data?.relationship ?? "many-to-one";
  const symbols = useMemo(() => getSymbolTypes(relationship), [relationship]);
  const stroke = palette["border"];

  const style = useMemo(
    () => ({
      strokeWidth: 1.5,
      stroke,
      ...(isHidden ? { visibility: "hidden" as const } : {}),
    }),
    [stroke, isHidden],
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
          transform={`translate(${midArrow.x},${midArrow.y}) rotate(${midArrow.angle})`}
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
          />
          {isSelfRef ? (
            <SourceSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
            />
          ) : (
            <TargetSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
            />
          )}
        </g>
      )}
    </>
  );
});
