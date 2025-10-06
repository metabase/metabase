import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo, useContext } from "react";
import { t } from "ttag";

import { Box, FixedSizeIcon, Group, Stack, UnstyledButton } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { DependencyFlowContext } from "../DependencyFlowContext";
import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

import type { DependentGroup } from "./types";
import { getDependentGroupLabel, getDependentGroups } from "./utils";

type DependencyNodeContentProps = NodeProps<NodeType>;

export const DependencyNodeContent = memo(function ItemNode({
  data: node,
}: DependencyNodeContentProps) {
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
                key={group.type}
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
  const { selectedGroupNode, selectedGroupType, handleSelectDependencyGroup } =
    useContext(DependencyFlowContext);
  const isSelected =
    node.id === selectedGroupNode?.id &&
    node.type === selectedGroupNode?.type &&
    group.type === selectedGroupType;

  return (
    <UnstyledButton
      key={group.type}
      p="0.125rem 0.25rem"
      c={isSelected ? "white" : "text-primary"}
      bg={isSelected ? "brand" : "bg-medium"}
      bdrs="xs"
      onClick={() => handleSelectDependencyGroup(node, group.type)}
    >
      {getDependentGroupLabel(group)}
    </UnstyledButton>
  );
}
