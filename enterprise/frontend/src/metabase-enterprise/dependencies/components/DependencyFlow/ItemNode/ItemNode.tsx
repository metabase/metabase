import type { NodeProps } from "@xyflow/react";
import { memo } from "react";

import { Icon } from "metabase/ui";

import { NodeControls } from "../NodeControls";
import type { ItemNodeType } from "../types";

import { getNodeIcon, getNodeLabel } from "./utils";

type ItemNodeProps = NodeProps<ItemNodeType>;

export const ItemNode = memo(function ItemNode({
  id,
  data,
  isConnectable,
}: ItemNodeProps) {
  return (
    <>
      <Icon flex="0 0 auto" name={getNodeIcon(data)} c="brand" />
      {getNodeLabel(data)}
      <NodeControls nodeId={id} isConnectable={isConnectable} />
    </>
  );
});
