import { BezierEdge, type EdgeProps, useNodesInitialized } from "@xyflow/react";
import { useContext } from "react";
import { GraphContext } from "./GraphContext";

export function GraphEdge({ id, style, ...props }: EdgeProps) {
  const isInitialized = useNodesInitialized();
  const { isolatedPath } = useContext(GraphContext);
  const isDimmed = isolatedPath !== null && !isolatedPath.edgeIds.has(id);

  return (
    <BezierEdge
      {...props}
      id={id}
      style={{
        ...style,
        visibility: !isInitialized ? "hidden" : undefined,
        opacity: isDimmed ? 0.15 : undefined,
      }}
    />
  );
}
