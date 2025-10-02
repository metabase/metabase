import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";

import { Box, FixedSizeIcon, Group, Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeGroupLabel, getNodeGroups, getNodeIcon } from "./utils";

type EntityNodeProps = NodeProps<Node<DependencyNode>>;

export const EntityNode = memo(function EntityNode({
  data: node,
  sourcePosition = Position.Left,
  targetPosition = Position.Right,
  isConnectable,
}: EntityNodeProps) {
  const groups = getNodeGroups(node);
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      <Stack gap="sm">
        <Group gap="sm" lh="1rem">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {node.data.name}
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
