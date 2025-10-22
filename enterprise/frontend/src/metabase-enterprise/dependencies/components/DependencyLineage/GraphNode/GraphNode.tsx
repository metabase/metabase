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
  FixedSizeIcon,
  Group,
  Pill,
  Stack,
  UnstyledButton,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { GraphContext } from "../GraphContext";
import type { GraphSelection, NodeType } from "../types";
import { getNodeIcon, getNodeLabel, isSameNode } from "../utils";

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
  const groups = getDependentGroups(node);
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });
  const isSelected =
    selection != null && isSameNode(node, selection.id, selection.type);

  const handleClick = () => {
    setSelection({ id: node.id, type: node.type, withInfo: true });
  };

  return (
    <>
      <Stack
        className={cx(S.card, { [S.selected]: isSelected })}
        p="md"
        gap="sm"
        aria-label={label}
        data-testid="graph-node"
        onClick={handleClick}
      >
        <Group gap="sm" lh="1rem">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" />
          {label}
        </Group>
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
  selection: GraphSelection | undefined;
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
    isSameNode(node, selection.id, selection.type) &&
    selection.groupType === group.type;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onSelectionChange({
      id: node.id,
      type: node.type,
      groupType: group.type,
      withInfo: true,
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
