import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";

import { Icon } from "metabase/ui";

import type { ItemData } from "../types";

import { getNodeIcon, getNodeLabel } from "./utils";

type ItemNodeProps = NodeProps<Node<ItemData>>;

export const ItemNode = memo(function EntityNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: ItemNodeProps) {
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      <Icon flex="0 0 auto" name={getNodeIcon(data.node)} c="brand" />
      {getNodeLabel(data.node)}
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
