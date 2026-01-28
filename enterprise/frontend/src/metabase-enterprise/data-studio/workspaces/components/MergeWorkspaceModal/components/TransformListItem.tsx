import cx from "classnames";

import { Flex, Icon, Text } from "metabase/ui";
import type {
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import S from "../MergeWorkspaceModal.module.css";
import { useTransformSources } from "../hooks/useTransformSources";

type TransformListItemProps = {
  transform: WorkspaceTransformListItem;
  isSelected: boolean;
  onClick: () => void;
  workspaceId: WorkspaceId;
};

export const TransformListItem = ({
  transform,
  isSelected,
  onClick,
  workspaceId,
}: TransformListItemProps) => {
  const { diffStats } = useTransformSources(workspaceId, transform);

  return (
    <Flex
      align="center"
      justify="space-between"
      px="md"
      py="sm"
      className={cx(S.sidebarItem, isSelected && S.sidebarItemActive)}
      onClick={onClick}
      data-testid={`transform-list-item`}
    >
      <Flex align="center" gap="sm" style={{ overflow: "hidden" }}>
        <Icon name="code_block" size={14} c="text-secondary" />
        <Text truncate>{transform.name}</Text>
      </Flex>
      {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) && (
        <Flex gap="xs" fz="xs" style={{ flexShrink: 0 }}>
          {diffStats.additions > 0 && (
            <Text c="success">+{diffStats.additions}</Text>
          )}
          {diffStats.deletions > 0 && (
            <Text c="danger">-{diffStats.deletions}</Text>
          )}
        </Flex>
      )}
    </Flex>
  );
};
