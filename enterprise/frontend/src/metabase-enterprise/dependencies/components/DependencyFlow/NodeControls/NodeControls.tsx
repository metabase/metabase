import {
  Handle,
  Position,
  useEdges,
  useNodeConnections,
  useNodes,
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";

import { ActionIcon, Icon } from "metabase/ui";

import type { NodeId, NodeType } from "../types";
import { getNodesWithToggledNode, isNodeExpanded } from "../utils/collapsing";

import S from "./NodeControls.module.css";

type NodeControlsProps = {
  nodeId: NodeId;
  isConnectable?: boolean;
};

export function NodeControls({ nodeId, isConnectable }: NodeControlsProps) {
  const nodes = useNodes<NodeType>();
  const edges = useEdges();
  const { setNodes } = useReactFlow<NodeType>();
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });
  const isExpanded = isNodeExpanded(nodes, edges, nodeId);

  const handleToggle = () => {
    const newNodes = getNodesWithToggledNode(nodes, edges, nodeId, isExpanded);
    setNodes(newNodes);
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
          className={cx({ [S.hidden]: !isExpanded })}
          type="target"
          position={Position.Right}
          isConnectable={isConnectable}
        />
      )}
    </>
  );
}
