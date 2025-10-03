import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";

import { Icon } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon } from "./utils";

type ItemNodeProps = NodeProps<Node<DependencyNode>>;

export const ItemNode = memo(function EntityNode({
  data: node,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: ItemNodeProps) {
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      <Icon flex="0 0 auto" name={getNodeIcon(node)} c="brand" />
      {node.data.name}
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
