import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";

import { Box, Card, FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { NODE_HEIGHT, NODE_WIDTH } from "../constants";

import S from "./CustomNode.module.css";
import { getNodeIcon, getNodeLabel } from "./utils";

type CustomNodeProps = NodeProps<Node<DependencyNode>>;

export function CustomNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: CustomNodeProps) {
  return (
    <>
      <Card w={NODE_WIDTH} h={NODE_HEIGHT} withBorder>
        <Flex align="center" gap="sm" lh="1rem">
          <FixedSizeIcon name={getNodeIcon(data)} c="brand" />
          <Box className={S.label}>{getNodeLabel(data)}</Box>
        </Flex>
      </Card>
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
      />
    </>
  );
}
