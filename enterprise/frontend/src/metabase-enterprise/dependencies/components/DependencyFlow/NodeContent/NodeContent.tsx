import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo } from "react";
import { t } from "ttag";

import { Box, FixedSizeIcon, Group, Stack, UnstyledButton } from "metabase/ui";

import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

import type { DependentGroup } from "./types";
import { getDependentGroupLabel, getDependentGroups } from "./utils";

type NodeContentProps = NodeProps<NodeType>;

export const NodeContent = memo(function ItemNode({
  data: node,
}: NodeContentProps) {
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
              <DependentGroupButton key={group.type} group={group} />
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
  group: DependentGroup;
};

function DependentGroupButton({ group }: DependentGroupButtonProps) {
  return (
    <UnstyledButton
      key={group.type}
      p="0.125rem 0.25rem"
      bg="bg-medium"
      bdrs="xs"
    >
      {getDependentGroupLabel(group)}
    </UnstyledButton>
  );
}
