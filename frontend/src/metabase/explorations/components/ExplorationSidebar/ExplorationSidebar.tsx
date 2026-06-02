import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { t } from "ttag";

import {
  explorationApi,
  useCancelExplorationThreadMutation,
  useUpdateExplorationMutation,
} from "metabase/api/exploration";
import { EditableText } from "metabase/common/components/EditableText";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree, useTree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { useToast } from "metabase/common/hooks";
import {
  trackExplorationAISummaryOpened,
  trackExplorationStopped,
  trackExplorationVisualizationChanged,
} from "metabase/explorations/analytics";
import {
  EXPLORATION_NAME_MAX_LENGTH,
  QUERY_INTERESTINGNESS_SCORE_THRESHOLD,
} from "metabase/explorations/constants";
import {
  ActionIcon,
  Box,
  Ellipsified,
  Icon,
  type IconProps,
  Loader,
  Menu,
  Stack,
} from "metabase/ui";
import type {
  Exploration,
  ExplorationId,
  ExplorationQueryStatus,
  ExplorationThreadId,
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";
import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./ExplorationSidebar.module.css";
import {
  type ExplorationTreeHeading,
  type ExplorationTreeItem,
  type ExplorationTreeNode,
  flattenTree,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  tree: ITreeNodeItem<ExplorationTreeNode>[];
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
  getSelectedEntityIdUrl: (entityId: SelectedEntityId) => string;
}

export function ExplorationSidebar({
  exploration,
  tree,
  selectedEntityId,
  setSelectedEntityId,
  getSelectedEntityIdUrl,
}: ExplorationSidebarProps) {
  const treeController = useTree({
    data: tree,
    selectedId: selectedEntityId?.id,
  });
  const pendingKeyboardSelectionRef = useRef(false);

  const [updateExploration] = useUpdateExplorationMutation();
  const [sendToast] = useToast();

  const handleNameChange = useCallback(
    async (name: string) => {
      const { error } = await updateExploration({ id: exploration.id, name });
      if (error) {
        sendToast({
          message: t`Failed to update name`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
      }
    },
    [updateExploration, sendToast, exploration.id],
  );

  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  const prefetchQueryResult = explorationApi.usePrefetch(
    "getExplorationQueryResult",
  );

  const handlePrefetch = useCallback(
    (item: ITreeNodeItem<ExplorationTreeNode>) => {
      if (item.data?.type !== "group") {
        return;
      }
      const queries = item.data.queries;
      for (const query of queries) {
        if (query.status === "done") {
          prefetchQueryResult(query.id);
        }
      }
    },
    [prefetchQueryResult],
  );

  // `collapse` is stable, but treeController is not
  // so we need to be careful to prevent this effect from running on every render
  // eslint complains when passing `treeController.collapse` to `useEffect` deps
  // so destructure it
  const { collapse } = treeController;

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
        if (
          nextItem.data?.type !== "group" &&
          nextItem.data?.type !== "document"
        ) {
          return;
        }
        if (nextItem.data.type === "group") {
          setSelectedEntityId({ type: "group", id: nextItem.data.group_id });
        } else if (nextItem.data.type === "document") {
          setSelectedEntityId({ type: "document", id: nextItem.data.id });
        }
        if (nextItem.data.type === "group") {
          trackExplorationVisualizationChanged(exploration.id, "keyboard");
        } else if (nextItem.data.isAiSummary) {
          trackExplorationAISummaryOpened(exploration.id);
        }
        event.preventDefault();
        pendingKeyboardSelectionRef.current = true;
        // prefetch the following item
        // if the user uses a keyboard shortcut once, they're likely to use it again
        const followingItem = getAdjacentById(
          flatItems,
          nextItem.id,
          direction,
        );
        if (followingItem != null) {
          handlePrefetch(followingItem);
        }
      }
      // if we moved into a different folder, collapse the previous folder
      const currentItem = flatItems.find(
        (item) => item.id === selectedEntityId.id,
      );
      if (
        currentItem?.data?.parent_id &&
        currentItem.data.parent_id !== nextItem?.data?.parent_id
      ) {
        collapse(currentItem.data.parent_id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    flatItems,
    selectedEntityId,
    setSelectedEntityId,
    handlePrefetch,
    collapse,
    exploration.id,
  ]);

  const TreeNode = useCallback(
    (props: TreeNodeProps<ExplorationTreeNode>) => (
      <ExplorationTreeNode
        {...props}
        explorationId={exploration.id}
        handlePrefetch={handlePrefetch}
        pendingKeyboardSelectionRef={pendingKeyboardSelectionRef}
        getSelectedEntityIdUrl={getSelectedEntityIdUrl}
      />
    ),
    [exploration.id, handlePrefetch, getSelectedEntityIdUrl],
  );

  return (
    <Stack
      h="100%"
      w="20%"
      miw="20.5rem"
      flex="none"
      gap="lg"
      pt="3rem"
      mr="2rem"
    >
      <EditableText
        initialValue={exploration.name}
        onChange={handleNameChange}
        fw="bold"
        fz="h3"
        lh="h3"
        isDisabled={!exploration.can_write}
        pl="0.75rem"
        maxLength={EXPLORATION_NAME_MAX_LENGTH}
      />
      <Box className={S.tree}>
        <Tree role="tree" tree={treeController} TreeNode={TreeNode} />
      </Box>
    </Stack>
  );
}

interface ExplorationTreeNodeProps extends TreeNodeProps<ExplorationTreeNode> {
  explorationId: ExplorationId;
  handlePrefetch: (item: ITreeNodeItem<ExplorationTreeNode>) => void;
  pendingKeyboardSelectionRef: React.MutableRefObject<boolean>;
  getSelectedEntityIdUrl: (entityId: SelectedEntityId) => string;
}

function ExplorationTreeNode(props: ExplorationTreeNodeProps) {
  if (isExplorationTreeHeadingProps(props)) {
    return <ExplorationTreeHeading {...props} />;
  }
  if (isExplorationTreeItemProps(props)) {
    return <ExplorationTreeItem {...props} />;
  }
  return null;
}

interface ExplorationTreeHeadingProps extends ExplorationTreeNodeProps {
  item: ITreeNodeItem<ExplorationTreeHeading>;
}

function isExplorationTreeHeadingProps(
  props: ExplorationTreeNodeProps,
): props is ExplorationTreeHeadingProps {
  return props.item.data?.type === "heading";
}

function ExplorationTreeHeading({
  item,
  isExpanded,
  onToggleExpand,
  depth,
}: ExplorationTreeHeadingProps) {
  return (
    <Box
      role="group"
      aria-label={item.name}
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
      <ExplorationThreadMenu item={item} />
    </Box>
  );
}

function ExplorationThreadMenu({
  item,
}: {
  item: ITreeNodeItem<ExplorationTreeHeading>;
}) {
  const [cancelThread] = useCancelExplorationThreadMutation();
  const [sendToast] = useToast();

  const handleCancelThread = useCallback(
    async (explorationId: ExplorationId, threadId: ExplorationThreadId) => {
      const { error } = await cancelThread({ explorationId, threadId });
      if (error) {
        sendToast({
          message: t`Failed to stop`,
        });
        return;
      }
      trackExplorationStopped(explorationId);
    },
    [cancelThread, sendToast],
  );

  if (!item.data?.explorationId || !item.data?.thread) {
    return null;
  }
  const { explorationId, thread } = item.data;
  const menuItems = [];

  if (thread.completed_at == null) {
    menuItems.push(
      <Menu.Item
        key="stop"
        onClick={() => handleCancelThread(explorationId, thread.id)}
      >
        {t`Stop running`}
      </Menu.Item>,
    );
  }

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon
          size="1.25rem"
          mr="-0.25rem"
          c="icon-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" size="1rem" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        {menuItems}
      </Menu.Dropdown>
    </Menu>
  );
}

interface ExplorationTreeItemProps extends ExplorationTreeNodeProps {
  item: ITreeNodeItem<ExplorationTreeItem>;
}

function isExplorationTreeItemProps(
  props: ExplorationTreeNodeProps,
): props is ExplorationTreeItemProps {
  return (
    props.item.data?.type === "document" || props.item.data?.type === "group"
  );
}

function ExplorationTreeItem({
  item,
  isSelected,
  depth,
  explorationId,
  handlePrefetch,
  pendingKeyboardSelectionRef,
  getSelectedEntityIdUrl,
}: ExplorationTreeItemProps) {
  const itemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isSelected && pendingKeyboardSelectionRef.current) {
      itemRef.current?.scrollIntoView({
        block: "nearest",
      });
      pendingKeyboardSelectionRef.current = false;
    }
  }, [isSelected, pendingKeyboardSelectionRef]);

  const handleClick = useCallback(() => {
    if (!isSelected) {
      if (item.data?.type === "group") {
        trackExplorationVisualizationChanged(explorationId, "click");
      } else if (item.data?.isAiSummary) {
        trackExplorationAISummaryOpened(explorationId);
      }
    }
  }, [isSelected, item.data, explorationId]);

  if (!item.data) {
    return null;
  }

  const entityId: SelectedEntityId =
    item.data.type === "group"
      ? { type: "group", id: item.data.group_id }
      : { type: "document", id: item.data.id };

  const iconProps =
    typeof item.icon === "string" ? { name: item.icon } : item.icon;

  return (
    <ForwardRefLink
      ref={itemRef}
      to={getSelectedEntityIdUrl(entityId)}
      role="treeitem"
      aria-selected={isSelected}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: isSelected,
      })}
      onMouseEnter={() => handlePrefetch(item)}
      onClick={handleClick}
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
    </ForwardRefLink>
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
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }
  return <Icon {...iconProps} c="text-secondary" aria-label={t`Ready`} />;
}
