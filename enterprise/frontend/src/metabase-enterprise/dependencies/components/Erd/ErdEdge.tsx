import {
  BaseEdge,
  type EdgeProps,
  SmoothStepEdge,
  useNodesInitialized,
} from "@xyflow/react";

import { usePalette } from "metabase/common/hooks/use-palette";

export function ErdEdge(props: EdgeProps) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const hiddenStyle = !isInitialized ? { visibility: "hidden" as const } : {};

  if (isSelfRef) {
    // Both handles on the right side of the node.
    // Draw a square loop with small rounded corners that curves outward to the right.
    const { sourceX, sourceY, targetX, targetY } = props;
    const offset = 50; // how far right the loop extends
    const r = 8; // corner radius

    const midX = Math.max(sourceX, targetX) + offset;

    // Square path: right from source → down/up → left to target, with rounded corners
    const edgePath = [
      `M ${sourceX} ${sourceY}`,
      `L ${midX - r} ${sourceY}`,
      `Q ${midX} ${sourceY} ${midX} ${sourceY + (sourceY < targetY ? r : -r)}`,
      `L ${midX} ${targetY + (sourceY < targetY ? -r : r)}`,
      `Q ${midX} ${targetY} ${midX - r} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(" ");

    return (
      <BaseEdge
        path={edgePath}
        markerEnd={props.markerEnd}
        style={{
          strokeWidth: 2,
          stroke: palette["border"],
          ...hiddenStyle,
        }}
      />
    );
  }

  return (
    <SmoothStepEdge
      {...props}
      style={{
        ...props.style,
        strokeWidth: 2,
        stroke: palette["border"],
        ...hiddenStyle,
      }}
    />
  );
}
