import { Handle, Position } from "@xyflow/react";

import { Card, FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { NODE_HEIGHT, NODE_WIDTH } from "../constants";

import { getNodeIcon, getNodeLabel } from "./utils";

type CustomNodeProps = {
  data: DependencyNode;
};

export function CustomNode({ data }: CustomNodeProps) {
  return (
    <>
      <Card w={NODE_WIDTH} h={NODE_HEIGHT} withBorder>
        <Flex align="center" gap="sm" lh="1rem">
          <FixedSizeIcon name={getNodeIcon(data)} c="brand" />
          {getNodeLabel(data)}
        </Flex>
      </Card>
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </>
  );
}
