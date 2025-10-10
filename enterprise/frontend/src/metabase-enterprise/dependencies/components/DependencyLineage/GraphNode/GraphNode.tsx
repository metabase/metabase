import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import { memo, useContext } from "react";
import { t } from "ttag";

import {
  Box,
  FixedSizeIcon,
  Group,
  Pill,
  Stack,
  UnstyledButton,
} from "metabase/ui";
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
      <Stack p="md" gap="sm">
        <Group gap="sm">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {getNodeLabel(node)}
        </Group>
        {groups.length > 0 && (
          <>
            <Box c="text-secondary" fz="sm" lh="1rem">{t`Used by`}</Box>
            {groups.map((group) => (
              <DependencyGroupButton
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

type DependencyGroupButtonProps = {
  node: DependencyNode;
  group: DependentGroup;
};

function DependencyGroupButton({ node, group }: DependencyGroupButtonProps) {
  const { selection, setSelection } = useContext(GraphContext);
  const isSelected =
    node.id === selection?.node.id &&
    node.type === selection?.node.type &&
    group.type === selection.groupType;

  return (
    <Pill
      key={group.type}
      component={UnstyledButton}
      c={isSelected ? "white" : "text-primary"}
      bg={isSelected ? "brand" : "bg-medium"}
      fw="normal"
      onClick={() => setSelection({ node, groupType: group.type })}
    >
      {getDependentGroupLabel(group)}
    </Pill>
  );
}
