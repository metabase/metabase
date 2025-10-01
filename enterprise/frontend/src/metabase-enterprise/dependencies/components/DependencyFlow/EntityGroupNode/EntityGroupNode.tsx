import { Handle, type NodeProps, Position } from "@xyflow/react";

import type { EntityGroupNode } from "../types";

import { getNodeLabel } from "./utils";

type EntityGroupNodeProps = NodeProps<EntityGroupNode>;

export function EntityGroupNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: EntityGroupNodeProps) {
  return (
    <>
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
