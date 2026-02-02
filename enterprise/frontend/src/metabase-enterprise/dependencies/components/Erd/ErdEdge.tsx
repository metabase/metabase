import {
  BaseEdge,
  type EdgeProps,
  MarkerType,
  SmoothStepEdge,
  useNodesInitialized,
} from "@xyflow/react";

const EDGE_STYLE = {
  stroke: "var(--mb-color-border)",
  strokeWidth: 1.5,
};

const MARKER_START = {
  type: MarkerType.Arrow,
  color: "var(--mb-color-border)",
  width: 16,
  height: 16,
} as unknown as string;

const MARKER_END = {
  type: MarkerType.ArrowClosed,
  color: "var(--mb-color-border)",
  width: 16,
  height: 16,
} as unknown as string;

export function ErdEdge(props: EdgeProps) {
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const hiddenStyle = !isInitialized ? { visibility: "hidden" as const } : {};

  if (isSelfRef) {
    // Both handles on the right side of the node.
    // Draw a square loop with small rounded corners that curves outward to the right.
    const { sourceX, sourceY, targetX, targetY, markerEnd } = props;
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
        markerEnd={markerEnd}
        style={{ ...EDGE_STYLE, ...hiddenStyle }}
      />
    );
  }

  return (
    <SmoothStepEdge
      {...props}
      style={{
        ...props.style,
        ...EDGE_STYLE,
        ...hiddenStyle,
      }}
      markerStart={MARKER_START}
      markerEnd={MARKER_END}
    />
  );
}
