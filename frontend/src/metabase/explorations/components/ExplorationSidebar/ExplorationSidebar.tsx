import cx from "classnames";
import { useEffect, useMemo, useRef } from "react";
import { t } from "ttag";

import { Tree } from "metabase/common/components/tree";
import type { TreeHandle } from "metabase/common/components/tree/Tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { QUERY_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import {
  Box,
  Ellipsified,
  Icon,
  type IconProps,
  Loader,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Exploration, ExplorationQueryStatus } from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";
import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./ExplorationSidebar.module.css";
import {
  type ExplorationTreeHeading,
  type ExplorationTreeItem,
  type ExplorationTreeNode,
  flattenTree,
  getExplorationSidebarTree,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
}

export function ExplorationSidebar({
  exploration,
  selectedEntityId,
  setSelectedEntityId,
}: ExplorationSidebarProps) {
  const treeRef = useRef<TreeHandle>(null);

  const tree = useMemo(
    () => getExplorationSidebarTree(exploration),
    [exploration],
  );

  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedEntityId == null) {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextItem = getAdjacentById(
        flatItems,
        selectedEntityId.id,
        direction,
      );
      if (nextItem != null && nextItem.id !== selectedEntityId.id) {
        if (nextItem.data?.type === "group") {
          setSelectedEntityId({ type: "group", id: nextItem.data.group_id });
        } else if (nextItem.data?.type === "document") {
          setSelectedEntityId({ type: "document", id: nextItem.data.id });
        }
        event.preventDefault();
      }
      // if we moved into a different folder, collapse the previous folder
      const currentItem = flatItems.find(
        (item) => item.id === selectedEntityId.id,
      );
      if (
        currentItem?.data?.parent_id &&
        currentItem.data.parent_id !== nextItem?.data?.parent_id
      ) {
        treeRef.current?.collapse(currentItem.data.parent_id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, selectedEntityId, setSelectedEntityId]);

  return (
    <Stack h="100%" w="20%" flex="none" gap="lg" pt="3rem" mr="2rem">
      <Text size="xl" fw="bold" pl="0.75rem">
        {exploration.name}
      </Text>
      <Box className={S.tree}>
        <Tree
          ref={treeRef}
          data={tree}
          selectedId={selectedEntityId?.id}
          onSelect={(item) => {
            if (item.data?.type === "group") {
              setSelectedEntityId({ type: "group", id: item.data.group_id });
            } else if (item.data?.type === "document") {
              setSelectedEntityId({ type: "document", id: item.data.id });
            }
          }}
          TreeNode={ExplorationTreeNode}
        />
      </Box>
    </Stack>
  );
}

function ExplorationTreeNode(props: TreeNodeProps<ExplorationTreeNode>) {
  const { item } = props;
  if (item.data?.type === "heading") {
    return (
      <ExplorationTreeHeading
        {...(props as TreeNodeProps<ExplorationTreeHeading>)}
      />
    );
  }
  if (item.data?.type === "document" || item.data?.type === "group") {
    return (
      <ExplorationTreeItem {...(props as TreeNodeProps<ExplorationTreeItem>)} />
    );
  }
  return null;
}

function ExplorationTreeHeading({
  item,
  isExpanded,
  onToggleExpand,
  depth,
}: TreeNodeProps<ExplorationTreeHeading>) {
  return (
    <UnstyledButton
      aria-expanded={isExpanded}
      className={S.treeRow}
      onClick={onToggleExpand}
      style={{ marginLeft: depth * 16 }}
    >
      <Icon
        name={isExpanded ? "chevrondown" : "chevronright"}
        c="brand"
        aria-hidden
      />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {item.name}
      </Ellipsified>
    </UnstyledButton>
  );
}

function ExplorationTreeItem({
  item,
  isSelected,
  onSelect,
  depth,
}: TreeNodeProps<ExplorationTreeItem>) {
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // if selected via keyboard shortcuts, scroll into view
    // if selected by clicking, the item was already in view, so it's a no-op
    if (isSelected) {
      itemRef.current?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [isSelected]);

  const iconProps =
    typeof item.icon === "string" ? { name: item.icon } : item.icon;

  return (
    <UnstyledButton
      ref={itemRef}
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: isSelected,
      })}
      onClick={onSelect}
      style={{ marginLeft: depth * 16 }}
    >
      <ExplorationTreeItemIcon
        status={item.data?.status}
        iconProps={iconProps}
      />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {item.name}
      </Ellipsified>
      {item.data?.type === "group" &&
        (item.data.interestingness_score ?? 0) >
          QUERY_INTERESTINGNESS_SCORE_THRESHOLD && (
          <PotentiallyInterestingMarker />
        )}
    </UnstyledButton>
  );
}

function ExplorationTreeItemIcon({
  status,
  iconProps,
}: {
  status: ExplorationQueryStatus | undefined;
  iconProps: IconProps;
}) {
  if (status === "running" || status === "pending") {
    return <Loader size="xs" aria-label={t`Loading…`} />;
  }
  if (status === "error") {
    return <Icon name="warning" c="error" aria-label={t`Failed to generate`} />;
  }
  return <Icon {...iconProps} c="text-secondary" aria-label={t`Ready`} />;
}
