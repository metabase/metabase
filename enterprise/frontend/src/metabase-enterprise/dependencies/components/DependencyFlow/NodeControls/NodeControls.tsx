import {
  Handle,
  Position,
  useNodeConnections,
  useReactFlow,
} from "@xyflow/react";
import cx from "classnames";

import { ActionIcon, Icon } from "metabase/ui";

import type { NodeId, NodeType } from "../types";
import {
  getNodesWithCollapsedNodes,
  getNodesWithExpandedNodes,
} from "../utils";

import S from "./NodeControls.module.css";

type NodeControlsProps = {
  id: NodeId;
  isExpanded: boolean;
};

export function NodeControls({ id, isExpanded }: NodeControlsProps) {
  const { getNodes, getEdges, setNodes } = useReactFlow<NodeType>();
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  const handleToggle = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const newNodes = isExpanded
      ? getNodesWithCollapsedNodes(nodes, edges, [id])
      : getNodesWithExpandedNodes(nodes, edges, [id]);
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
        <Handle type="source" position={Position.Left} isConnectable={false} />
      )}
      {targets.length > 0 && (
        <Handle
          className={cx({ [S.hidden]: !isExpanded })}
          type="target"
          position={Position.Right}
          isConnectable={false}
        />
      )}
    </>
  );
}
