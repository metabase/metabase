import {
  Handle,
  Position,
  useNodeConnections,
  useReactFlow,
} from "@xyflow/react";

import { ActionIcon, Icon } from "metabase/ui";

import type { NodeId } from "../types";
import { getGraphWithToggledNode } from "../utils/collapsing";

type NodeControlsProps = {
  nodeId: NodeId;
  isExpanded: boolean;
  isConnectable?: boolean;
};

export function NodeControls({
  nodeId,
  isExpanded,
  isConnectable,
}: NodeControlsProps) {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  const handleToggle = () => {
    const { nodes, edges } = getGraphWithToggledNode(
      getNodes(),
      getEdges(),
      nodeId,
      isExpanded,
    );
    setNodes(nodes);
    setEdges(edges);
  };

  return (
    <>
      {targets.length > 0 && (
        <ActionIcon onClick={handleToggle}>
          <Icon name={isExpanded ? "contract" : "expand"} />
        </ActionIcon>
      )}
      {sources.length > 0 && (
        <Handle
          type="source"
          position={Position.Left}
          isConnectable={isConnectable}
        />
      )}
      {targets.length > 0 && (
        <Handle
          type="target"
          position={Position.Right}
          isConnectable={isConnectable}
        />
      )}
    </>
  );
}
