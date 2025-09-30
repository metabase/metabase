import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

import { FixedSizeIcon } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "./utils";

type CustomNodeProps = NodeProps<Node<DependencyNode>>;

export function CustomNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: CustomNodeProps) {
  return (
    <>
      <FixedSizeIcon name={getNodeIcon(data)} c="brand" />
      {getNodeLabel(data)}
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
      />
    </>
  );
}
