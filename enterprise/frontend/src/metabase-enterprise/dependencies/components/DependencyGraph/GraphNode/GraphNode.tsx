import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
} from "@xyflow/react";
import cx from "classnames";
import { type MouseEvent, memo, useContext } from "react";

import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Pill,
  Stack,
  UnstyledButton,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { GraphContext } from "../GraphContext";
import type { GraphSelection, NodeType } from "../types";
import {
  getNodeIcon,
  getNodeLabel,
  getNodeTypeInfo,
  isSameNode,
} from "../utils";

import S from "./GraphNode.module.css";
import type { DependentGroup } from "./types";
import {
  getDependencyGroupTitle,
  getDependentGroupLabel,
  getDependentGroups,
} from "./utils";

type GraphNodeProps = NodeProps<NodeType>;

export const GraphNode = memo(function ItemNode({
  data: node,
}: GraphNodeProps) {
  const { selection, setSelection } = useContext(GraphContext);
  const label = getNodeLabel(node);
  const typeInfo = getNodeTypeInfo(node);
  const groups = getDependentGroups(node);
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });
  const isSelected = selection != null && isSameNode(node, selection);

  const handleClick = () => {
    setSelection({ id: node.id, type: node.type });
  };

  return (
    <>
      <Card
        className={cx(S.card, { [S.selected]: isSelected })}
        p="lg"
        withBorder
        aria-label={label}
        aria-selected={isSelected}
        data-testid="graph-node"
        onClick={handleClick}
      >
        <Stack gap="sm">
          <Group c={typeInfo.color} gap="xs">
            <FixedSizeIcon name={getNodeIcon(node)} />
            <Box fz="sm" fw="bold" lh="1rem">
              {typeInfo.label}
            </Box>
          </Group>
          <Box fw="bold" lh="1rem">
            {label}
          </Box>
        </Stack>
        <Stack mt="md" gap="sm" align="start">
          <Box c="text-secondary" fz="sm" lh="1rem">
            {getDependencyGroupTitle(node, groups)}
          </Box>
          {groups.map((group) => (
            <DependencyGroupButton
              key={group.type}
              node={node}
              group={group}
              selection={selection}
              onSelectionChange={setSelection}
            />
          ))}
        </Stack>
      </Card>
      {sources.length > 0 && (
        <Handle type="source" position={Position.Left} isConnectable={false} />
      )}
      {targets.length > 0 && (
        <Handle type="target" position={Position.Right} isConnectable={false} />
      )}
    </>
  );
});

type DependencyGroupButtonProps = {
  node: DependencyNode;
  group: DependentGroup;
  selection: GraphSelection | null;
  onSelectionChange: (selection: GraphSelection) => void;
};

function DependencyGroupButton({
  node,
  group,
  selection,
  onSelectionChange,
}: DependencyGroupButtonProps) {
  const isSelected =
    selection != null &&
    isSameNode(node, selection) &&
    selection.groupType === group.type;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onSelectionChange({
      id: node.id,
      type: node.type,
      groupType: group.type,
    });
  };

  return (
    <Pill
      key={group.type}
      component={UnstyledButton}
      className={cx(S.pill, { [S.selected]: isSelected })}
      fw="normal"
      onClick={handleClick}
    >
      {getDependentGroupLabel(group)}
    </Pill>
  );
}
