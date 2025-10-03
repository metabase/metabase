import { type NodeProps, useEdges, useNodes } from "@xyflow/react";
import { memo } from "react";

import { NodeControls } from "../NodeControls";
import type { GroupNodeData, GroupNodeType, NodeId, NodeType } from "../types";
import { isNodeExpanded } from "../utils";

import { getNodeLabel } from "./utils";

type GroupNodeProps = NodeProps<GroupNodeType>;

export const GroupNode = memo(function EntityNode({
  id,
  data,
}: GroupNodeProps) {
  const nodes = useNodes<NodeType>();
  const edges = useEdges();
  const isExpanded = isNodeExpanded(nodes, edges, id);

  return <GroupNodeBody id={id} data={data} isExpanded={isExpanded} />;
});

type GroupNodeBodyProps = {
  id: NodeId;
  data: GroupNodeData;
  isExpanded: boolean;
};

const GroupNodeBody = memo(function GroupNodeBody({
  id,
  data,
  isExpanded,
}: GroupNodeBodyProps) {
  return (
    <>
      {getNodeLabel(data)}
      <NodeControls id={id} isExpanded={isExpanded} />
    </>
  );
});
