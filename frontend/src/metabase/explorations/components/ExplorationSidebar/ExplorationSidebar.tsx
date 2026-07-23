import cx from "classnames";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { t } from "ttag";

import {
  explorationApi,
  useCancelExplorationThreadMutation,
  useRestartExplorationThreadMutation,
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
  trackExplorationRestarted,
  trackExplorationStopped,
  trackExplorationVisualizationChanged,
} from "metabase/explorations/analytics";
import {
  type ExplorationSidebarTab,
  isExplorationSidebarTab,
} from "metabase/explorations/types";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  ActionIcon,
  Box,
  Center,
  Ellipsified,
  Group,
  Icon,
  type IconProps,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  Exploration,
  ExplorationId,
  ExplorationPageNodeId,
  ExplorationQueryStatus,
  ExplorationThreadId,
} from "metabase-types/api";
import {
  isRestartableExplorationThreadStatus,
  isSettledExplorationQueryStatus,
  isTerminalExplorationThreadStatus,
} from "metabase-types/api";

import { useCopyLink } from "../../hooks/useCopyLink";
import type { ExplorationSortOrder } from "../../sidebar-preferences";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";

import { ExplorationErrorMarker } from "./ExplorationErrorMarker";
import { ExplorationLastActivity } from "./ExplorationLastActivity";
import S from "./ExplorationSidebar.module.css";
import {
  type ExplorationHeadingKind,
  type ExplorationSidebarTabsInfo,
  type ExplorationTreeHeading,
  type ExplorationTreeNode,
  type ExplorationTreePage,
  flattenTree,
  pickInitialSidebarPage,
} from "./utils";

const HEADING_ICON: Record<
  ExplorationHeadingKind,
  { name: IconProps["name"]; color: IconProps["c"] }
> = {
  root: { name: "insight", color: "brand" },
  "sub-exploration": { name: "git_branch", color: "brand" },
  "metric-group": { name: "metric", color: "text-secondary" },
};

interface ExplorationSidebarProps {
  exploration: Exploration;
  explorationSidebarTabsInfo: ExplorationSidebarTabsInfo;
  selectedSidebarTab: ExplorationSidebarTab;
  getSelectedSidebarTabUrl: (tab: ExplorationSidebarTab) => string;
  tree: ITreeNodeItem<ExplorationTreeNode>[];
  selectedPageId: ExplorationPageNodeId | null;
  setSelectedPageId: (pageId: ExplorationPageNodeId) => void;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
  shouldScrollSelectionRef: React.MutableRefObject<boolean>;
  isOpen: boolean;
  readPageIds: ReadonlySet<string>;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  sortOrder: ExplorationSortOrder;
  onChangeSortOrder: (sortOrder: ExplorationSortOrder) => void;
}

export function ExplorationSidebar({
  exploration,
  explorationSidebarTabsInfo,
  selectedSidebarTab,
  getSelectedSidebarTabUrl,
  tree,
  selectedPageId,
  setSelectedPageId,
  getSelectedPageUrl,
  shouldScrollSelectionRef,
  isOpen,
  readPageIds,
  showHidden,
  onToggleShowHidden,
  sortOrder,
  onChangeSortOrder,
}: ExplorationSidebarProps) {
  const dispatch = useDispatch();
  const treeController = useTree({
    data: tree,
    selectedId: selectedPageId ?? undefined,
    freezeAutoExpandOnManualToggle: true,
  });

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

  // When programmatic navigation sets shouldScrollSelectionRef, also expand
  // the tree to reveal the selected item. useTree's auto-expand is frozen
  // after a manual chevron toggle, so we bypass it here.
  useEffect(() => {
    if (shouldScrollSelectionRef.current && selectedPageId) {
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(selectedPageId, tree)]),
      );
    }
  }, [selectedPageId, shouldScrollSelectionRef, setExpandedIds, tree]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedPageId == null) {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextItem = getAdjacentById(flatItems, selectedPageId, direction);
      if (nextItem != null && nextItem.id !== selectedPageId) {
        if (nextItem.data?.type !== "page") {
          return;
        }
        setSelectedPageId(nextItem.data.page_id);
        trackExplorationVisualizationChanged(exploration.id, "keyboard");
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
      const currentItem = flatItems.find((item) => item.id === selectedPageId);
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
    selectedPageId,
    setSelectedPageId,
    setExpandedIds,
    handlePrefetch,
    collapse,
    exploration.id,
    shouldScrollSelectionRef,
  ]);

  const treeContextValue = useMemo<ExplorationTreeContextValue>(
    () => ({
      explorationId: exploration.id,
      canWrite: exploration.can_write,
      handlePrefetch,
      shouldScrollSelectionRef,
      getSelectedPageUrl,
      readPageIds,
    }),
    [
      exploration.id,
      exploration.can_write,
      handlePrefetch,
      shouldScrollSelectionRef,
      getSelectedPageUrl,
      readPageIds,
    ],
  );

  const isEmptyDueToHidden =
    !showHidden && tree.every((node) => !node.children?.length);

  if (!isOpen) {
    // we still want keyboard shortcuts to work, so the component should still be mounted
    return null;
  }

  const emptyTreeMessage =
    explorationSidebarTabsInfo[selectedSidebarTab].emptyTreeMessage;

  return (
    <Stack h="100%" w="20%" miw="20.5rem" flex="none" mr="2rem">
      <Group pl="0.5rem" gap="md" wrap="nowrap" align="center">
        <Box flex={1} miw={0}>
          <SegmentedControl<ExplorationSidebarTab>
            fullWidth
            radius="xl"
            bg="background-tertiary"
            value={selectedSidebarTab}
            onChange={(value) => {
              if (isExplorationSidebarTab(value)) {
                dispatch(push(getSelectedSidebarTabUrl(value)));
              }
            }}
            data={Object.values(explorationSidebarTabsInfo).map(
              ({ value, label }) => ({
                value,
                label: <SidebarTabLabel tab={value} label={label} />,
              }),
            )}
          />
        </Box>
        <SidebarShowFilterMenu
          showHidden={showHidden}
          onToggleShowHidden={onToggleShowHidden}
          sortOrder={sortOrder}
          onChangeSortOrder={onChangeSortOrder}
        />
      </Group>
      {tree.length > 0 ? (
        <Box flex={1} data-testid="exploration-page-sidebar" className={S.tree}>
          <ExplorationTreeContext.Provider value={treeContextValue}>
            <Tree
              role="tree"
              tree={treeController}
              TreeNode={ExplorationTreeNode}
              wrapNodesInListItem
            />
          </ExplorationTreeContext.Provider>
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

const TAB_ICON: Partial<Record<ExplorationSidebarTab, IconProps["name"]>> = {
  stars: "star_filled",
  discussions: "comment",
};

function SidebarTabLabel({
  tab,
  label,
}: {
  tab: ExplorationSidebarTab;
  label: string;
}) {
  const iconName = TAB_ICON[tab];

  return iconName ? (
    <Tooltip label={label}>
      <Center component="span" aria-label={label}>
        <Icon name={iconName} />
      </Center>
    </Tooltip>
  ) : (
    label
  );
}

function SidebarShowFilterMenu({
  showHidden,
  onToggleShowHidden,
  sortOrder,
  onChangeSortOrder,
}: {
  showHidden: boolean;
  onToggleShowHidden: () => void;
  sortOrder: ExplorationSortOrder;
  onChangeSortOrder: (sortOrder: ExplorationSortOrder) => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className={cx(S.filterButton, {
            [S.filterButtonActive]: showHidden,
          })}
          radius="xl"
          size="lg"
          aria-label={t`Filter`}
          aria-pressed={showHidden}
          data-testid="exploration-show-hidden-toggle"
        >
          <Icon name="filter" c={showHidden ? "white" : "text-secondary"} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Sort order`}</Menu.Label>
        <ShowFilterItem
          label={t`Interestingness`}
          checked={sortOrder === "interestingness"}
          onToggle={() => onChangeSortOrder("interestingness")}
        />
        <ShowFilterItem
          label={t`Alphabetical`}
          checked={sortOrder === "alphabetical"}
          onToggle={() => onChangeSortOrder("alphabetical")}
        />
        <Menu.Divider />
        <ShowFilterItem
          label={t`Show hidden items`}
          checked={showHidden}
          onToggle={onToggleShowHidden}
          data-testid="exploration-show-hidden-item"
        />
      </Menu.Dropdown>
    </Menu>
  );
}

function ShowFilterItem({
  label,
  checked,
  onToggle,
  "data-testid": dataTestId,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  "data-testid"?: string;
}) {
  return (
    <Menu.Item
      data-checked={checked || undefined}
      closeMenuOnClick={false}
      leftSection={<Icon name={checked ? "check" : "empty"} />}
      onClick={onToggle}
      data-testid={dataTestId}
    >
      {label}
    </Menu.Item>
  );
}

interface ExplorationTreeContextValue {
  explorationId: ExplorationId;
  canWrite: boolean;
  handlePrefetch: (item: ITreeNodeItem<ExplorationTreeNode>) => void;
  shouldScrollSelectionRef: React.MutableRefObject<boolean>;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
  readPageIds: ReadonlySet<string>;
}

const ExplorationTreeContext =
  createContext<ExplorationTreeContextValue | null>(null);

interface ExplorationTreeNodeProps
  extends TreeNodeProps<ExplorationTreeNode>, ExplorationTreeContextValue {}

function ExplorationTreeNode(props: TreeNodeProps<ExplorationTreeNode>) {
  const treeContext = useContext(ExplorationTreeContext);
  if (treeContext == null) {
    return null;
  }
  const nodeProps = { ...props, ...treeContext };
  if (isExplorationTreeHeadingProps(nodeProps)) {
    return <ExplorationTreeHeading {...nodeProps} />;
  }
  if (isExplorationTreeItemProps(nodeProps)) {
    return <ExplorationTreeItem {...nodeProps} />;
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
  hasChildren,
  onToggleExpand,
  depth,
  explorationId,
  canWrite,
  getSelectedPageUrl,
}: ExplorationTreeHeadingProps) {
  const isLoading = isLoadingStatus(item.data?.status);
  // Only the retained initial-investigation heading can be childless (pruning
  // drops every other empty heading). The tree controller can't expand a node
  // without children, so force the expanded look: the all-hidden note beneath
  // then reads as the group's content rather than a collapsed group.
  const displayExpanded = isExpanded || !hasChildren;
  return (
    <Box
      role="group"
      aria-label={item.name}
      aria-expanded={displayExpanded}
      aria-busy={isLoading}
      className={cx(S.treeRow, S.treeRowHeading, {
        [S.treeRowNested]: depth > 0,
        [S.treeRowThreadSeparated]:
          depth === 0 && item.data?.headingKind === "sub-exploration",
      })}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onToggleExpand();
          e.preventDefault();
        }
      }}
      onClick={onToggleExpand}
      style={{ "--tree-depth": depth }}
    >
      <Box className={S.treeChevron} aria-hidden>
        <Icon
          name={displayExpanded ? "chevrondown" : "chevronright"}
          size={12}
          c="text-tertiary"
        />
      </Box>
      <ExplorationHeadingIcon
        headingKind={item.data?.headingKind}
        status={item.data?.status}
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
      {item.data?.lastActivityAt && isSettled(item.data.status) && (
        <ExplorationLastActivity lastActivityAt={item.data.lastActivityAt} />
      )}
      <ExplorationGroupMenu
        item={item}
        canWrite={canWrite}
        explorationId={explorationId}
        getSelectedPageUrl={getSelectedPageUrl}
      />
    </Box>
  );
}

function ExplorationGroupMenu({
  item,
  canWrite,
  explorationId,
  getSelectedPageUrl,
}: {
  item: ITreeNodeItem<ExplorationTreeHeading>;
  canWrite: boolean;
  explorationId: ExplorationId;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
}) {
  const [cancelThread] = useCancelExplorationThreadMutation();
  const [restartExplorationThread] = useRestartExplorationThreadMutation();
  const [setPagesHidden] = useSetPagesHiddenMutation();
  const [sendToast] = useToast();
  const copyLink = useCopyLink();

  const groupName = item.name;
  const itemPageIds = item.data?.pageIds;
  const pageIds = useMemo(() => itemPageIds ?? [], [itemPageIds]);
  // when the whole group is already hidden, the action shows it again
  const allHidden = item.data?.allHidden === true;
  const canHideGroup =
    canWrite && item.data?.hideable === true && pageIds.length > 0;

  const handleToggleGroupHidden = useCallback(async () => {
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
  }, [setPagesHidden, pageIds, explorationId, groupName, allHidden, sendToast]);

  const handleCopyLink = useCallback(() => {
    const page = pickInitialSidebarPage(item.children ?? []);
    if (page == null) {
      return;
    }
    copyLink(`${window.location.origin}${getSelectedPageUrl(page)}`);
  }, [item.children, getSelectedPageUrl, copyLink]);

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
    async (explorationId: ExplorationId, threadId: ExplorationThreadId) => {
      const { error } = await restartExplorationThread({
        explorationId,
        threadId,
      });
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
    [restartExplorationThread, sendToast],
  );

  const thread = item.data?.thread;
  const canStop =
    canWrite &&
    thread != null &&
    !isTerminalExplorationThreadStatus(thread.status);
  const canRestart =
    canWrite &&
    thread != null &&
    isRestartableExplorationThreadStatus(thread.status);

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon
          className={S.groupMenuTrigger}
          size="1rem"
          c="icon-primary"
          aria-label={t`Group actions`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" size="1rem" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<Icon name="link" />} onClick={handleCopyLink}>
          {t`Copy link`}
        </Menu.Item>
        {canHideGroup && (
          <Menu.Item
            leftSection={<Icon name={allHidden ? "eye" : "eye_crossed_out"} />}
            onClick={handleToggleGroupHidden}
          >
            {allHidden ? t`Show` : t`Hide`}
          </Menu.Item>
        )}
        {canStop && (
          <Menu.Item
            onClick={() => handleCancelThread(explorationId, thread.id)}
          >
            {t`Stop running`}
          </Menu.Item>
        )}
        {canRestart && (
          <Menu.Item onClick={() => handleRestart(explorationId, thread.id)}>
            {t`Restart`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface ExplorationTreeItemProps extends ExplorationTreeNodeProps {
  item: ITreeNodeItem<ExplorationTreePage>;
}

function isExplorationTreeItemProps(
  props: ExplorationTreeNodeProps,
): props is ExplorationTreeItemProps {
  return props.item.data?.type === "page";
}

function ExplorationTreeItem({
  item,
  isSelected,
  depth,
  explorationId,
  handlePrefetch,
  shouldScrollSelectionRef,
  getSelectedPageUrl,
  readPageIds,
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
    if (!isSelected && item.data?.type === "page") {
      trackExplorationVisualizationChanged(explorationId, "click");
    }
  }, [isSelected, item.data, explorationId]);

  if (!item.data) {
    return null;
  }

  const pageId = item.data.page_id;

  const iconProps: IconProps = {
    color: isSelected ? "brand" : "icon-secondary",
    name: typeof item.icon === "string" ? item.icon : item.icon.name,
  };

  const pageData = item.data.type === "page" ? item.data : null;
  const isError = pageData?.status === "error";
  const isHidden = pageData?.hidden === true;
  const isLoading = isLoadingStatus(item.data?.status);
  const isUnread = pageData != null && !readPageIds.has(pageData.page_id);

  return (
    <ForwardRefLink
      ref={itemRef}
      to={getSelectedPageUrl(pageId)}
      role="treeitem"
      aria-selected={isSelected}
      aria-busy={isLoading}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: isSelected,
        [S.treeRowNested]: depth > 0,
      })}
      onMouseEnter={() => handlePrefetch(item)}
      onClick={handleClick}
      // custom css var used for tree styles
      style={{ "--tree-depth": depth } as React.CSSProperties}
    >
      <ExplorationTreeItemIcon
        status={item.data?.status}
        iconProps={iconProps}
      />
      <Ellipsified
        flex={1}
        size="md"
        lh="1rem"
        fw={isUnread ? 700 : 500}
        {...(isLoading ? { className: S.shimmerText, c: "transparent" } : {})}
      >
        {item.name}
      </Ellipsified>
      {isHidden && (
        <Icon
          name="eye_crossed_out"
          c="icon-secondary"
          size="1rem"
          flex="none"
          tooltip={t`Hidden`}
          aria-label={t`Hidden`}
        />
      )}
      {isError && (
        <ExplorationErrorMarker
          message={t`We couldn't generate one or more of these charts.`}
        />
      )}
    </ForwardRefLink>
  );
}

function ExplorationHeadingIcon({
  headingKind,
  status,
}: {
  headingKind: ExplorationHeadingKind | undefined;
  status: ExplorationQueryStatus | undefined;
}) {
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }
  if (headingKind == null) {
    return null;
  }
  const { name, color } = HEADING_ICON[headingKind];
  return <Icon name={name} c={color} aria-hidden />;
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
