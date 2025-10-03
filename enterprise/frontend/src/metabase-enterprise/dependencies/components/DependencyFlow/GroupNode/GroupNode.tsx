import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";

import type { DependencyGroup } from "../types";

import { getNodeLabel } from "./utils";

type GroupNodeProps = NodeProps<Node<DependencyGroup>>;

export const GroupNode = memo(function EntityNode({
  data: group,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: GroupNodeProps) {
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      {getNodeLabel(group)}
      {sources.length > 0 && (
        <Handle
          type="source"
          position={sourcePosition}
          isConnectable={isConnectable}
        />
      )}
      {targets.length > 0 && (
        <Handle
          type="target"
          position={targetPosition}
          isConnectable={isConnectable}
        />
      )}
    </>
  );
});
