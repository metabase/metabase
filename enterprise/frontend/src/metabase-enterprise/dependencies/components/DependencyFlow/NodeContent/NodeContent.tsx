import { Handle, type NodeProps, Position } from "@xyflow/react";
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

  return (
    <>
      <Stack gap="sm">
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
      <Handle type="source" position={Position.Left} />
      <Handle type="target" position={Position.Right} />
    </>
  );
});

type DependentGroupButtonProps = {
  group: DependentGroup;
};

function DependentGroupButton({ group }: DependentGroupButtonProps) {
  return (
    <UnstyledButton key={group.type} p="0.125rem 0.25rem" bg="bg-medium">
      ${getDependentGroupLabel(group)}
    </UnstyledButton>
  );
}
