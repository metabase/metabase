import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { t } from "ttag";

import {
  explorationApi,
  useCancelExplorationThreadMutation,
  useRestartExplorationMutation,
  useSetPagesHiddenMutation,
} from "metabase/api/exploration";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree, useTree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { getInitialExpandedIds } from "metabase/common/components/tree/utils";
import { useToast } from "metabase/common/hooks";
import {
  trackExplorationAISummaryOpened,
  trackExplorationRestarted,
  trackExplorationStopped,
  trackExplorationVisualizationChanged,
} from "metabase/explorations/analytics";
import {
  ExplorationErrorMarker,
  PotentiallyInterestingMarker,
} from "metabase/explorations/components/PotentiallyInterestingMarker";
import { QUERY_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import {
  ActionIcon,
  Box,
  Center,
  Ellipsified,
  Icon,
  type IconProps,
  Menu,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  Exploration,
  ExplorationId,
  ExplorationQueryStatus,
  ExplorationThreadId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";

import { ExplorationLastActivity } from "./ExplorationLastActivity";
import S from "./ExplorationSidebar.module.css";
import {
  type ExplorationSidebarTabsInfo,
  type ExplorationTreeHeading,
  type ExplorationTreeItem,
  type ExplorationTreeNode,
  flattenTree,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  explorationSidebarTabsInfo: ExplorationSidebarTabsInfo;
  selectedSidebarTab: ExplorationSidebarTab;
  tabsWithNewContent?: ReadonlySet<ExplorationSidebarTab>;
  getSelectedSidebarTabUrl: (tab: ExplorationSidebarTab) => string;
  tree: ITreeNodeItem<ExplorationTreeNode>[];
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
  getSelectedEntityIdUrl: (entityId: SelectedEntityId) => string;
  isOpen: boolean;
  showHidden: boolean;
  onToggleShowHidden: () => void;
}

export function ExplorationSidebar({
  exploration,
  explorationSidebarTabsInfo,
  selectedSidebarTab,
  tabsWithNewContent,
  getSelectedSidebarTabUrl,
  tree,
  selectedEntityId,
  setSelectedEntityId,
  getSelectedEntityIdUrl,
  isOpen,
  showHidden,
  onToggleShowHidden,
}: ExplorationSidebarProps) {
  const treeController = useTree({
    data: tree,
    selectedId: selectedEntityId?.id,
    freezeAutoExpandOnManualToggle: true,
  });
  const shouldScrollSelectionRef = useRef(true); // initially true to scroll selection from URL into view

  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  const prefetchQueryResult = explorationApi.usePrefetch(
    "getExplorationQueryResult",
  );

  const handlePrefetch = useCallback(
    (item: ITreeNodeItem<ExplorationTreeNode>) => {
      if (item.data?.type !== "page") {
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
  const { collapse, setExpandedIds } = treeController;

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
          nextItem.data?.type !== "page" &&
          nextItem.data?.type !== "document"
        ) {
          return;
        }
        if (nextItem.data.type === "page") {
          setSelectedEntityId({ type: "page", id: nextItem.data.page_id });
        } else if (nextItem.data.type === "document") {
          setSelectedEntityId({ type: "document", id: nextItem.data.id });
        }
        if (nextItem.data.type === "page") {
          trackExplorationVisualizationChanged(exploration.id, "keyboard");
        } else if (nextItem.data.isAiSummary) {
          trackExplorationAISummaryOpened(exploration.id);
        }
        event.preventDefault();
        shouldScrollSelectionRef.current = true;
        setExpandedIds(
          (prev) =>
            new Set([...prev, ...getInitialExpandedIds(nextItem.id, tree)]),
        );
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
    tree,
    selectedEntityId,
    setSelectedEntityId,
    setExpandedIds,
    handlePrefetch,
    collapse,
    exploration.id,
  ]);

  const TreeNode = useCallback(
    (props: TreeNodeProps<ExplorationTreeNode>) => (
      <ExplorationTreeNode
        {...props}
        explorationId={exploration.id}
        canWrite={exploration.can_write}
        handlePrefetch={handlePrefetch}
        shouldScrollSelectionRef={shouldScrollSelectionRef}
        getSelectedEntityIdUrl={getSelectedEntityIdUrl}
      />
    ),
    [
      exploration.id,
      exploration.can_write,
      handlePrefetch,
      getSelectedEntityIdUrl,
    ],
  );

  const isEmptyDueToHidden = useMemo(() => {
    if (showHidden || (tree[0]?.children?.length || 0) > 0) {
      return false;
    }
    return (tree[0]?.children?.length || 0) === 0;
  }, [showHidden, tree]);

  if (!isOpen) {
    // we still want keyboard shortcuts to work, so the component should still be mounted
    return null;
  }

  const emptyTreeMessage =
    explorationSidebarTabsInfo[selectedSidebarTab].emptyTreeMessage;

  return (
    <Stack h="100%" w="20%" miw="20.5rem" flex="none" mr="2rem">
      <Tabs
        pl="0.5rem"
        pr="1rem"
        classNames={{ tab: S.tab }}
        value={selectedSidebarTab}
      >
        <Tabs.List>
          {Object.values(explorationSidebarTabsInfo).map(({ value, label }) => (
            <Tabs.Tab
              key={value}
              value={value}
              rightSection={
                tabsWithNewContent?.has(value) ? <NewContentDot /> : undefined
              }
              renderRoot={(props) => (
                <ForwardRefLink
                  {...props}
                  to={getSelectedSidebarTabUrl(value)}
                />
              )}
            >
              {label}
            </Tabs.Tab>
          ))}
          <Tooltip
            label={
              showHidden
                ? t`Don't display hidden pages`
                : t`Display hidden pages`
            }
          >
            <ActionIcon
              ml="auto"
              my="auto"
              variant={showHidden ? "filled" : "subtle"}
              c={showHidden ? undefined : "icon-secondary"}
              aria-label={t`Display hidden pages`}
              aria-pressed={showHidden}
              data-testid="exploration-show-hidden-toggle"
              onClick={onToggleShowHidden}
            >
              <Icon name="filter" />
            </ActionIcon>
          </Tooltip>
        </Tabs.List>
      </Tabs>
      {tree.length > 0 ? (
        <Box flex={1} data-testid="exploration-page-sidebar" className={S.tree}>
          <Tree role="tree" tree={treeController} TreeNode={TreeNode} />
          {isEmptyDueToHidden && (
            <Text c="text-secondary" fs="italic" px="0.5rem" pl="1.75rem">
              {t`All items have been hidden.`}
            </Text>
          )}
        </Box>
      ) : (
        <Center flex={1} pl="0.5rem" pr="1rem" pb="3rem">
          <Text fz="lg">{emptyTreeMessage}</Text>
        </Center>
      )}
    </Stack>
  );
}

function NewContentDot() {
  return (
    <Tooltip label={t`New research to look at`}>
      <Box
        aria-label={t`New research to look at`}
        data-testid="exploration-tab-new-content-dot"
        bg="brand"
        w="0.375rem"
        h="0.375rem"
        bdrs="50%"
        flex="none"
      />
    </Tooltip>
  );
}

interface ExplorationTreeNodeProps extends TreeNodeProps<ExplorationTreeNode> {
  explorationId: ExplorationId;
  canWrite: boolean;
  handlePrefetch: (item: ITreeNodeItem<ExplorationTreeNode>) => void;
  shouldScrollSelectionRef: React.MutableRefObject<boolean>;
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

function isSettled(status: ExplorationQueryStatus | undefined): boolean {
  return status == null || isSettledExplorationQueryStatus(status);
}

function isLoadingStatus(status: ExplorationQueryStatus | undefined): boolean {
  return status != null && !isSettledExplorationQueryStatus(status);
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
  explorationId,
  canWrite,
}: ExplorationTreeHeadingProps) {
  const isLoading = isLoadingStatus(item.data?.status);
  const pageIds = item.data?.pageIds ?? [];
  const canHideGroup =
    canWrite && item.data?.hideable === true && pageIds.length > 0;
  return (
    <Box
      role="group"
      aria-label={item.name}
      aria-expanded={isExpanded}
      aria-busy={isLoading}
      className={S.treeRow}
      onClick={onToggleExpand}
      style={{ marginLeft: `${depth}rem` }}
    >
      <Icon
        name={isExpanded ? "chevrondown" : "chevronright"}
        c="brand"
        aria-hidden
      />
      <ExplorationHeadingStatusIcon status={item.data?.status} />
      <Ellipsified
        flex={1}
        size="md"
        lh="1rem"
        fw={500}
        {...(isLoading ? { className: S.shimmerText, c: "transparent" } : {})}
      >
        {item.name}
      </Ellipsified>
      {canHideGroup && (
        <ExplorationGroupHideButton
          explorationId={explorationId}
          groupName={item.name}
          pageIds={pageIds}
          allHidden={item.data?.allHidden === true}
        />
      )}
      {item.data?.lastActivityAt && isSettled(item.data.status) && (
        <ExplorationLastActivity lastActivityAt={item.data.lastActivityAt} />
      )}
      <ExplorationThreadMenu item={item} canWrite={canWrite} />
    </Box>
  );
}

function ExplorationGroupHideButton({
  explorationId,
  groupName,
  pageIds,
  allHidden,
}: {
  explorationId: ExplorationId;
  groupName: string;
  pageIds: number[];
  allHidden: boolean;
}) {
  const [setPagesHidden] = useSetPagesHiddenMutation();
  const [sendToast] = useToast();

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      // don't toggle the group's expanded state when hiding/showing it
      event.stopPropagation();
      // when the whole group is already hidden, the control shows it again
      const nextHidden = !allHidden;
      try {
        await setPagesHidden({
          pageIds,
          explorationId,
          hidden: nextHidden,
        }).unwrap();
      } catch {
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to update ${groupName}`,
        });
        return;
      }
      if (nextHidden) {
        sendToast({
          icon: "eye_crossed_out",
          message: t`${groupName} hidden`,
          actionLabel: t`Undo`,
          actions: [
            () => setPagesHidden({ pageIds, explorationId, hidden: false }),
          ],
        });
      }
    },
    [setPagesHidden, pageIds, explorationId, groupName, allHidden, sendToast],
  );

  return (
    <Tooltip label={allHidden ? t`Show` : t`Hide`}>
      <ActionIcon
        className={S.hideGroupButton}
        size="1rem"
        c="icon-primary"
        aria-label={allHidden ? t`Show ${groupName}` : t`Hide ${groupName}`}
        onClick={handleClick}
      >
        <Icon name={allHidden ? "eye" : "eye_crossed_out"} size="1rem" />
      </ActionIcon>
    </Tooltip>
  );
}

function ExplorationThreadMenu({
  item,
  canWrite,
}: {
  item: ITreeNodeItem<ExplorationTreeHeading>;
  canWrite: boolean;
}) {
  const [cancelThread] = useCancelExplorationThreadMutation();
  const [restartExploration] = useRestartExplorationMutation();
  const [sendToast] = useToast();

  const handleCancelThread = useCallback(
    async (explorationId: ExplorationId, threadId: ExplorationThreadId) => {
      const { error } = await cancelThread({ explorationId, threadId });
      if (error) {
        sendToast({
          message: t`Failed to stop`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
      trackExplorationStopped(explorationId);
    },
    [cancelThread, sendToast],
  );

  const handleRestart = useCallback(
    async (explorationId: ExplorationId) => {
      const { error } = await restartExploration(explorationId);
      if (error) {
        sendToast({
          message: t`Failed to restart`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
      trackExplorationRestarted(explorationId);
    },
    [restartExploration, sendToast],
  );

  if (!item.data?.explorationId || !item.data?.thread) {
    return null;
  }
  const { explorationId, thread } = item.data;
  const menuItems = [];

  if (canWrite && thread.completed_at == null) {
    menuItems.push(
      <Menu.Item
        key="stop"
        onClick={() => handleCancelThread(explorationId, thread.id)}
      >
        {t`Stop running`}
      </Menu.Item>,
    );
  }

  if (canWrite && thread.canceled_at != null) {
    menuItems.push(
      <Menu.Item key="restart" onClick={() => handleRestart(explorationId)}>
        {t`Restart`}
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
          size="1rem"
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
    props.item.data?.type === "document" || props.item.data?.type === "page"
  );
}

function ExplorationTreeItem({
  item,
  isSelected,
  depth,
  explorationId,
  handlePrefetch,
  shouldScrollSelectionRef,
  getSelectedEntityIdUrl,
}: ExplorationTreeItemProps) {
  const itemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isSelected && shouldScrollSelectionRef.current) {
      itemRef.current?.scrollIntoView({
        block: "nearest",
      });
      shouldScrollSelectionRef.current = false;
    }
  }, [isSelected, shouldScrollSelectionRef]);

  const handleClick = useCallback(() => {
    if (!isSelected) {
      if (item.data?.type === "page") {
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
    item.data.type === "page"
      ? { type: "page", id: item.data.page_id }
      : { type: "document", id: item.data.id };

  const iconProps: IconProps = {
    color: isSelected ? "brand" : "icon-secondary",
    name: typeof item.icon === "string" ? item.icon : item.icon.name,
  };

  const pageData = item.data.type === "page" ? item.data : null;
  const isError = pageData?.status === "error";
  const isLoading = isLoadingStatus(item.data?.status);
  const isInteresting =
    !isError &&
    (pageData?.interestingness_score ?? 0) >=
      QUERY_INTERESTINGNESS_SCORE_THRESHOLD;

  return (
    <ForwardRefLink
      ref={itemRef}
      to={getSelectedEntityIdUrl(entityId)}
      role="treeitem"
      aria-selected={isSelected}
      aria-busy={isLoading}
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
      <Ellipsified
        flex={1}
        size="md"
        lh="1rem"
        fw={500}
        {...(isLoading ? { className: S.shimmerText, c: "transparent" } : {})}
      >
        {item.name}
      </Ellipsified>
      {isError && (
        <ExplorationErrorMarker
          message={t`We couldn't generate one or more of these charts.`}
        />
      )}
      {isInteresting && <PotentiallyInterestingMarker />}
    </ForwardRefLink>
  );
}

function ExplorationHeadingStatusIcon({
  status,
}: {
  status: ExplorationQueryStatus | undefined;
}) {
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }
  return null;
}

function ExplorationTreeItemIcon({
  status,
  iconProps,
}: {
  status: ExplorationQueryStatus | undefined;
  iconProps: IconProps;
}) {
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }

  if (status === "error" || isLoadingStatus(status)) {
    return <Icon {...iconProps} aria-hidden />;
  }

  return <Icon {...iconProps} aria-label={t`Ready`} />;
}
