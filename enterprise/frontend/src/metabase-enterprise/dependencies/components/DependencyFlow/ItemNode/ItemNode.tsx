import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";

import { Icon } from "metabase/ui";

import { NodeControls } from "../NodeControls";
import type { ItemData } from "../types";

import { getNodeIcon, getNodeLabel } from "./utils";

type ItemNodeProps = NodeProps<Node<ItemData>>;

export const ItemNode = memo(function EntityNode({
  id,
  data,
  isConnectable,
}: ItemNodeProps) {
  return (
    <>
      <Icon flex="0 0 auto" name={getNodeIcon(data.node)} c="brand" />
      {getNodeLabel(data.node)}
      <NodeControls
        nodeId={id}
        isExpanded={data.isExpanded}
        isConnectable={isConnectable}
      />
    </>
  );
});
