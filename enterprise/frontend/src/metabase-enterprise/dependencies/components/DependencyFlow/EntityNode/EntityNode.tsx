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
  const { node, sources, targets } = data;
  const groups = getNodeGroups(targets);

  return (
    <>
      <Stack gap="sm">
        <Group gap="sm" lh="1rem">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {getNodeLabel(node)}
        </Group>
        {groups.map((group) => (
          <Group key={group.type} gap="sm" fz="sm" lh="1rem">
            <Box px="xs" py="0.125rem" bg="bg-medium" bdrs="xs">
              {group.count}
            </Box>
            <Box c="text-secondary">{getNodeGroupLabel(group)}</Box>
          </Group>
        ))}
      </Stack>
      {sources.length > 0 && (
        <Handle
          type="source"
          position={sourcePosition}
          isConnectable={isConnectable}
        />
      )}
      {targets.length > 0 && (
        <Handle
          type="target"
          position={targetPosition}
          isConnectable={isConnectable}
        />
      )}
    </>
  );
});
