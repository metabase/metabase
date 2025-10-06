import type { NodeProps } from "@xyflow/react";
import { memo } from "react";

import { FixedSizeIcon } from "metabase/ui";

import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

type NodeContentProps = NodeProps<NodeType>;

export const NodeContent = memo(function ItemNode({ data }: NodeContentProps) {
  return (
    <>
      <FixedSizeIcon name={getNodeIcon(data)} c="brand" />
      {getNodeLabel(data)}
    </>
  );
});
