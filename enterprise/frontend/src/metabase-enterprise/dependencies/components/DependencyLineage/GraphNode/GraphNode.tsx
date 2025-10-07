import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo, useContext } from "react";
import { t } from "ttag";

import { Box, Chip, FixedSizeIcon, Group, Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { GraphContext } from "../GraphContext";
import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

import type { DependentGroup } from "./types";
import { getDependentGroupLabel, getDependentGroups } from "./utils";

type GraphNodeProps = NodeProps<NodeType>;

export const GraphNode = memo(function ItemNode({
  data: node,
}: GraphNodeProps) {
  const groups = getDependentGroups(node);
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });

  return (
    <>
      <Stack p="md" gap="sm" bd="1px solid border" bdrs="md" bg="bg-white">
        <Group gap="sm">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {getNodeLabel(node)}
        </Group>
        {groups.length > 0 && (
          <>
            <Box c="text-secondary" fz="sm" lh="1rem">{t`Used by`}</Box>
            {groups.map((group) => (
              <DependentGroupButton
                key={group.category}
                node={node}
                group={group}
              />
            ))}
          </>
        )}
      </Stack>
      {sources.length > 0 && <Handle type="source" position={Position.Left} />}
      {targets.length > 0 && <Handle type="target" position={Position.Right} />}
    </>
  );
});

type DependentGroupButtonProps = {
  node: DependencyNode;
  group: DependentGroup;
};

function DependentGroupButton({ node, group }: DependentGroupButtonProps) {
  const { selection, setSelection } = useContext(GraphContext);
  const isSelected =
    node.id === selection?.node.id &&
    node.type === selection?.node.type &&
    group.category === selection.category;

  return (
    <Chip
      key={group.category}
      checked={isSelected}
      onClick={() => setSelection({ node, category: group.category })}
    >
      {getDependentGroupLabel(group)}
    </Chip>
  );
}
