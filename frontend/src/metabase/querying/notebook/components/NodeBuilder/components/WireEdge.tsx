import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";

import S from "../NodeBuilder.module.css";

// The stock bezier edge plus a soft halo underneath when selected: a wide,
// translucent stroke in the wire's own colour, no blur, same arrowhead.
export function WireEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const stageLabel =
    typeof data?.stageLabel === "string" ? data.stageLabel : null;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      {selected && (
        <path
          d={path}
          fill="none"
          stroke={style?.stroke}
          strokeWidth={12}
          strokeOpacity={0.18}
          strokeLinecap="round"
          strokeDasharray={0}
          pointerEvents="none"
        />
      )}
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {stageLabel && (
        <EdgeLabelRenderer>
          <div
            className={S.stageLabel}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: style?.stroke,
            }}
          >
            {stageLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
