import { forwardRef } from "react";
import { t } from "ttag";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import {
  CollectionNodeRoot,
  ExpandToggleButton,
  FullWidthContainer,
  NameContainer,
  SidebarIcon,
} from "metabase/nav/containers/MainNavbar/SidebarItems/SidebarItems.styled";
import { Loader, Text } from "metabase/ui";

export type WorktreeRootData = {
  type: "worktree-root";
  /** Notifies the owner that the row was toggled, so content can load lazily. */
  onExpandChange: () => void;
};

export type WorktreePlaceholderData = {
  type: "worktree-placeholder";
  state: "loading" | "empty";
};

export const isWorktreeRootData = (data: unknown): data is WorktreeRootData =>
  typeof data === "object" &&
  data != null &&
  "type" in data &&
  data.type === "worktree-root";

const isWorktreePlaceholderData = (
  data: unknown,
): data is WorktreePlaceholderData =>
  typeof data === "object" &&
  data != null &&
  "type" in data &&
  data.type === "worktree-placeholder";

/**
 * The worktree's own row, styled exactly like a collection row in the sidebar:
 * the branch name takes the place of the collection name, and the whole row
 * toggles expansion.
 */
const WorktreeRootNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function WorktreeRootNode(
    { item, depth, hasChildren, isExpanded, onToggleExpand, rightSection },
    ref,
  ) {
    const handleToggle = () => {
      if (isWorktreeRootData(item.data)) {
        item.data.onExpandChange();
      }
      onToggleExpand();
    };

    return (
      <CollectionNodeRoot
        role="treeitem"
        depth={depth}
        aria-expanded={isExpanded}
        isSelected={false}
        hovered={false}
        hasDefaultIconStyle={false}
        onClick={handleToggle}
        ref={ref}
      >
        <ExpandToggleButton hidden={!hasChildren}>
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </ExpandToggleButton>
        <FullWidthContainer>
          <TreeNode.IconContainer transparent={false}>
            <SidebarIcon name="git_branch" isSelected={false} />
          </TreeNode.IconContainer>
          <NameContainer>{item.name}</NameContainer>
          {rightSection?.(item)}
        </FullWidthContainer>
      </CollectionNodeRoot>
    );
  },
);

const WorktreePlaceholderNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function WorktreePlaceholderNode({ item, depth }, ref) {
    const state = isWorktreePlaceholderData(item.data)
      ? item.data.state
      : "empty";

    return (
      <TreeNode.Root role="treeitem" depth={depth} isSelected={false} ref={ref}>
        {state === "loading" ? (
          <Loader size="xs" ml="sm" />
        ) : (
          <Text c="text-disabled" fz="sm">
            {t`No content. Pull to load this branch.`}
          </Text>
        )}
      </TreeNode.Root>
    );
  },
);

/**
 * Tree node for the worktrees sidebar section: the worktree root and its
 * loading/empty placeholders get dedicated rows, everything else is a plain
 * collection link.
 */
export const WorktreeTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function WorktreeTreeNode(props, ref) {
    const { data } = props.item;

    if (isWorktreeRootData(data)) {
      return <WorktreeRootNode {...props} ref={ref} />;
    }
    if (isWorktreePlaceholderData(data)) {
      return <WorktreePlaceholderNode {...props} ref={ref} />;
    }
    return <SidebarCollectionLink {...props} ref={ref} />;
  },
);
