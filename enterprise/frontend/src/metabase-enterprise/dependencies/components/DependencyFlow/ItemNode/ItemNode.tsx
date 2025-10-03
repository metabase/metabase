import { type NodeProps, useEdges, useNodes } from "@xyflow/react";
import { memo } from "react";

import { Icon } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { NodeControls } from "../NodeControls";
import type { ItemNodeType, NodeId, NodeType } from "../types";
import { isNodeExpanded } from "../utils";

import { getNodeIcon, getNodeLabel } from "./utils";

type ItemNodeProps = NodeProps<ItemNodeType>;

export const ItemNode = function ItemNode({ id, data }: ItemNodeProps) {
  const nodes = useNodes<NodeType>();
  const edges = useEdges();
  const isExpanded = isNodeExpanded(nodes, edges, id);

  return <ItemNodeBody id={id} data={data} isExpanded={isExpanded} />;
};

type ItemNodeBodyProps = {
  id: NodeId;
  data: DependencyNode;
  isExpanded: boolean;
};

const ItemNodeBody = memo(function ItemNodeBody({
  id,
  data,
  isExpanded,
}: ItemNodeBodyProps) {
  return (
    <>
      <Icon flex="0 0 auto" name={getNodeIcon(data)} c="brand" />
      {getNodeLabel(data)}
      <NodeControls id={id} isExpanded={isExpanded} />
    </>
  );
});
