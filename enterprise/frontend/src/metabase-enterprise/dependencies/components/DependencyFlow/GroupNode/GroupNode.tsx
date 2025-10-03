import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";

import type { GroupData } from "../types";

import { getNodeLabel } from "./utils";

type GroupNodeProps = NodeProps<Node<GroupData>>;

export const GroupNode = memo(function EntityNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: GroupNodeProps) {
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      {getNodeLabel(data)}
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
