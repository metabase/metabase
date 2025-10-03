import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";

import { NodeControls } from "../NodeControls";
import type { GroupData } from "../types";

import { getNodeLabel } from "./utils";

type GroupNodeProps = NodeProps<Node<GroupData>>;

export const GroupNode = memo(function EntityNode({
  id,
  data,
  isConnectable,
}: GroupNodeProps) {
  return (
    <>
      {getNodeLabel(data)}
      <NodeControls
        nodeId={id}
        isExpanded={data.isExpanded}
        isConnectable={isConnectable}
      />
    </>
  );
});
