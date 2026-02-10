import {
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";

import { usePalette } from "metabase/common/hooks/use-palette";

const DASH_PATTERN = "6 4";

export function SchemaViewerEdge(props: EdgeProps) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const hiddenStyle = !isInitialized ? { visibility: "hidden" as const } : {};
  const animationClass = "schema-viewer-edge-march";

  const style = {
    strokeWidth: 1,
    stroke: palette["border"],
    strokeDasharray: DASH_PATTERN,
    ...hiddenStyle,
  };

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
        style={style}
        className={animationClass}
      />
    );
  }

  const [edgePath] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={props.markerEnd}
      style={style}
      className={animationClass}
    />
  );
}
