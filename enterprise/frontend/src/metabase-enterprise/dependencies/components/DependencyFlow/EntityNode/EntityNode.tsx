import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

import { Box, FixedSizeIcon, Group, Stack } from "metabase/ui";

import type { NodeData } from "../types";

import {
  getNodeGroupLabel,
  getNodeGroups,
  getNodeIcon,
  getNodeLabel,
} from "./utils";

type EntityNodeProps = NodeProps<Node<NodeData>>;

export const EntityNode = memo(function EntityNode({
  data,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: EntityNodeProps) {
  const { node, sources } = data;
  const groups = getNodeGroups(sources);

  return (
    <>
      <Stack gap="sm">
        <Group gap="sm">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {getNodeLabel(node)}
        </Group>
        {groups.map((group) => (
          <Group key={group.type} gap="sm">
            <Box bg="bg-medium">{group.count}</Box>
            <Box c="text-secondary">{getNodeGroupLabel(group)}</Box>
          </Group>
        ))}
      </Stack>
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
});
