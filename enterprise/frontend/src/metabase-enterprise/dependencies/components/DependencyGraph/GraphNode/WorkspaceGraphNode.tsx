import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
  useNodesInitialized,
} from "@xyflow/react";
import cx from "classnames";
import type { MouseEvent } from "react";
import { memo, useContext } from "react";

import { useLazyGetTableQueryMetadataQuery } from "metabase/api";
import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Pill,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { DependentGroup } from "../../../types";
import {
  getDependencyGroupType,
  getDependencyGroupTypeInfo,
  getNodeIcon,
  getNodeLabel,
  isSameNode,
} from "../../../utils";
import { GraphContext } from "../GraphContext";
import type { GraphSelection, NodeType } from "../types";

import S from "./GraphNode.module.css";
import {
  getDependencyGroupTitle,
  getDependentGroupLabel,
  getDependentGroups,
} from "./utils";

type WorkspaceGraphNodeProps = NodeProps<NodeType>;

export const WorkspaceGraphNode = memo(function ItemNode({
  data: node,
}: WorkspaceGraphNodeProps) {
  const { selection, setSelection } = useContext(GraphContext);
  const label = getNodeLabel(node);
  const typeInfo = getDependencyGroupTypeInfo(getDependencyGroupType(node));
  const groups = getDependentGroups(node);
  const sources = useNodeConnections({ handleType: "source" });
  const targets = useNodeConnections({ handleType: "target" });
  const isSelected = selection != null && isSameNode(node, selection);
  const isInitialized = useNodesInitialized();

  // Fetch table data for input table nodes
  const [fetchTableMetadata] = useLazyGetTableQueryMetadataQuery();

  const handleClick = async () => {
    // Fetch table metadata when a table node is clicked
    if (node.type === "table" && node.data.table_id) {
      const tableData = await fetchTableMetadata(
        { id: node.data.table_id },
        true,
      ).unwrap();
      node.data.fields = tableData.fields;
    }

    setSelection({ id: node.id, type: node.type });
  };

  return (
    <>
      <Card
        className={cx(S.card, {
          [S.initialized]: isInitialized,
          [S.selected]: isSelected,
        })}
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
            <Text key={group.type}>{getDependentGroupLabel(group)}</Text>
          ))}
        </Stack>
      </Card>
      {sources.length > 0 && (
        <Handle
          className={cx(S.handle, { [S.initialized]: isInitialized })}
          type="source"
          position={Position.Left}
          isConnectable={false}
        />
      )}
      {targets.length > 0 && (
        <Handle
          className={cx(S.handle, { [S.initialized]: isInitialized })}
          type="target"
          position={Position.Right}
          isConnectable={false}
        />
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

// TODO (@stasgavrylov 15/01/2026):
// Leave a simpler representation for rependency group right now, but will
// probably return to this in
function _DependencyGroupButton({
  node,
  group,
  selection,
  onSelectionChange,
}: DependencyGroupButtonProps) {
  const isSelected =
    selection != null &&
    isSameNode(node, selection) &&
    selection.groupType === group.type;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
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
