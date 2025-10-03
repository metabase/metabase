import type { NodeProps } from "@xyflow/react";
import { memo } from "react";

import { NodeControls } from "../NodeControls";
import type { GroupNodeType } from "../types";

import { getNodeLabel } from "./utils";

type GroupNodeProps = NodeProps<GroupNodeType>;

export const GroupNode = memo(function EntityNode({
  id,
  data,
  isConnectable,
}: GroupNodeProps) {
  return (
    <>
      {getNodeLabel(data)}
      <NodeControls nodeId={id} isConnectable={isConnectable} />
    </>
  );
});
