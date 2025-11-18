import { BezierEdge, type EdgeProps, useNodesInitialized } from "@xyflow/react";

export function GraphEdge({ style, ...props }: EdgeProps) {
  const isInitialized = useNodesInitialized();

  return (
    <BezierEdge
      {...props}
      style={{
        ...style,
        visibility: !isInitialized ? "hidden" : undefined,
      }}
    />
  );
}
