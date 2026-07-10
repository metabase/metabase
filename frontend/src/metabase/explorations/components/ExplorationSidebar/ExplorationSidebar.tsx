import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  explorationApi,
  useCancelExplorationThreadMutation,
  useRestartExplorationMutation,
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
import { ExplorationErrorMarker } from "metabase/explorations/components/PotentiallyInterestingMarker";
import type { ExplorationShowFilters } from "metabase/explorations/sidebar-preferences";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import { useDispatch } from "metabase/redux";
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
  ExplorationQueryStatus,
  ExplorationThreadId,
} from "metabase-types/api";
import { isSettledExplorationQueryStatus } from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";

import { ExplorationLastActivity } from "./ExplorationLastActivity";
import S from "./ExplorationSidebar.module.css";
import {
  type ExplorationHeadingKind,
  type ExplorationSidebarTabsInfo,
  type ExplorationTreeHeading,
  type ExplorationTreeItem,
  type ExplorationTreeNode,
  flattenTree,
  pickInitialSidebarEntity,
} from "./utils";

// Each kind of heading carries a distinct icon so the tree reads as a legible
// investigation history: the initial spark, its follow-up branches, and the
// metric groups within each.
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
  tabsWithNewContent?: ReadonlySet<ExplorationSidebarTab>;
  getSelectedSidebarTabUrl: (tab: ExplorationSidebarTab) => string;
  tree: ITreeNodeItem<ExplorationTreeNode>[];
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
  getSelectedEntityIdUrl: (entityId: SelectedEntityId) => string;
  isOpen: boolean;
  readPageIds: ReadonlySet<string>;
  showFilters: ExplorationShowFilters;
  onToggleShowFilter: (key: keyof ExplorationShowFilters) => void;
  onArchiveGroup: (groupId: string | number) => void;
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
  readPageIds,
  showFilters,
  onToggleShowFilter,
  onArchiveGroup,
}: ExplorationSidebarProps) {
  const dispatch = useDispatch();
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
        readPageIds={readPageIds}
        onArchiveGroup={onArchiveGroup}
      />
    ),
    [
      exploration.id,
      exploration.can_write,
      handlePrefetch,
      getSelectedEntityIdUrl,
      readPageIds,
      onArchiveGroup,
    ],
  );

  if (!isOpen) {
    // we still want keyboard shortcuts to work, so the component should still be mounted
    return null;
  }

  const emptyTreeMessage =
    explorationSidebarTabsInfo[selectedSidebarTab].emptyTreeMessage;

  return (
    <Stack h="100%" w="20%" miw="20.5rem" flex="none" mr="2rem">
      <Group pl="0.5rem" pr="1rem" gap="xs" wrap="nowrap" align="center">
        <Box flex={1} miw={0}>
          <SegmentedControl
            fullWidth
            radius="xl"
            value={selectedSidebarTab}
            onChange={(value) =>
              dispatch(
                push(getSelectedSidebarTabUrl(value as ExplorationSidebarTab)),
              )
            }
            data={Object.values(explorationSidebarTabsInfo).map(
              ({ value, label }) => ({
                value,
                label: (
                  <SidebarTabLabel
                    tab={value}
                    label={label}
                    hasNewContent={tabsWithNewContent?.has(value) ?? false}
                  />
                ),
              }),
            )}
          />
        </Box>
        <SidebarShowFilterMenu
          showFilters={showFilters}
          onToggleShowFilter={onToggleShowFilter}
        />
      </Group>
      {tree.length > 0 ? (
        <Box flex={1} data-testid="exploration-page-sidebar" className={S.tree}>
          <Tree role="tree" tree={treeController} TreeNode={TreeNode} />
        </Box>
      ) : (
        <Center flex={1} pl="0.5rem" pr="1rem" pb="3rem">
          <Text fz="lg">{emptyTreeMessage}</Text>
        </Center>
      )}
    </Stack>
  );
}

function SidebarTabLabel({
  tab,
  label,
  hasNewContent,
}: {
  tab: ExplorationSidebarTab;
  label: string;
  hasNewContent: boolean;
}) {
  let content: React.ReactNode = label;
  if (tab === "stars") {
    content = (
      <Tooltip label={t`Stars`}>
        <Center component="span" aria-label={t`Stars`}>
          <Icon name="star_filled" />
        </Center>
      </Tooltip>
    );
  } else if (tab === "discussions") {
    content = (
      <Tooltip label={t`Discussions`}>
        <Center component="span" aria-label={t`Discussions`}>
          <Icon name="comment" />
        </Center>
      </Tooltip>
    );
  }

  if (!hasNewContent) {
    return content;
  }

  return (
    <Group component="span" gap="xs" justify="center" wrap="nowrap">
      {content}
      <NewContentDot />
    </Group>
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
  readPageIds: ReadonlySet<string>;
  onArchiveGroup: (groupId: string | number) => void;
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
  canWrite,
  explorationId,
  getSelectedEntityIdUrl,
  onArchiveGroup,
}: ExplorationTreeHeadingProps) {
  const isLoading = isLoadingStatus(item.data?.status);
  return (
    <Box
      role="group"
      aria-label={item.name}
      aria-expanded={isExpanded}
      aria-busy={isLoading}
      className={cx(S.treeRow, S.treeRowHeading, {
        [S.treeRowNested]: depth > 0,
        // Set off each follow-up branch from the investigation above it.
        [S.treeRowThreadSeparated]:
          depth === 0 && item.data?.headingKind === "sub-exploration",
      })}
      onClick={onToggleExpand}
      style={{ "--tree-depth": depth } as React.CSSProperties}
    >
      <Box className={S.treeChevron} aria-hidden>
        <Icon
          name={isExpanded ? "chevrondown" : "chevronright"}
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
        getSelectedEntityIdUrl={getSelectedEntityIdUrl}
        onArchiveGroup={onArchiveGroup}
      />
    </Box>
  );
}

function ExplorationGroupMenu({
  item,
  canWrite,
  explorationId,
  getSelectedEntityIdUrl,
  onArchiveGroup,
}: {
  item: ITreeNodeItem<ExplorationTreeHeading>;
  canWrite: boolean;
  explorationId: ExplorationId;
  getSelectedEntityIdUrl: (entityId: SelectedEntityId) => string;
  onArchiveGroup: (groupId: string | number) => void;
}) {
  const [cancelThread] = useCancelExplorationThreadMutation();
  const [restartExploration] = useRestartExplorationMutation();
  const [sendToast] = useToast();

  const handleCancelThread = useCallback(
    async (threadId: ExplorationThreadId) => {
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
    [cancelThread, explorationId, sendToast],
  );

  const handleRestart = useCallback(async () => {
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
  }, [restartExploration, explorationId, sendToast]);

  const handleCopyLink = useCallback(() => {
    const entity = pickInitialSidebarEntity(item.children ?? []);
    if (entity == null) {
      return;
    }
    const url = getSelectedEntityIdUrl(entity);
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    sendToast({ icon: "check", message: t`Copied link` });
  }, [item.children, getSelectedEntityIdUrl, sendToast]);

  // The stop/restart actions only make sense for investigation groups, which
  // carry a thread; metric group folders don't.
  const thread = item.data?.thread;
  const canStop = canWrite && thread != null && thread.completed_at == null;
  const canRestart = canWrite && thread != null && thread.canceled_at != null;

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

        <Menu.Item
          leftSection={<Icon name="archive" />}
          onClick={() => onArchiveGroup(item.id)}
        >
          {t`Archive`}
        </Menu.Item>

        {canStop && (
          <Menu.Item onClick={() => handleCancelThread(thread.id)}>
            {t`Stop running`}
          </Menu.Item>
        )}
        {canRestart && (
          <Menu.Item onClick={handleRestart}>{t`Restart`}</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

function SidebarShowFilterMenu({
  showFilters,
  onToggleShowFilter,
}: {
  showFilters: ExplorationShowFilters;
  onToggleShowFilter: (key: keyof ExplorationShowFilters) => void;
}) {
  const hasActiveFilter =
    showFilters.unread || showFilters.hidden || showFilters.interesting;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className={cx(S.filterButton, {
            [S.filterButtonActive]: hasActiveFilter,
          })}
          radius="xl"
          size="lg"
          aria-label={t`Filter`}
        >
          <Icon
            name="filter"
            c={hasActiveFilter ? "white" : "text-secondary"}
          />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <ShowFilterItem
          label={t`Unread`}
          checked={showFilters.unread}
          onToggle={() => onToggleShowFilter("unread")}
        />
        <ShowFilterItem
          label={t`Hidden`}
          checked={showFilters.hidden}
          onToggle={() => onToggleShowFilter("hidden")}
        />
        <ShowFilterItem
          label={t`Potentially interesting`}
          checked={showFilters.interesting}
          onToggle={() => onToggleShowFilter("interesting")}
        />
      </Menu.Dropdown>
    </Menu>
  );
}

function ShowFilterItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Menu.Item
      closeMenuOnClick={false}
      leftSection={<Icon name={checked ? "check" : "empty"} />}
      onClick={onToggle}
    >
      {label}
    </Menu.Item>
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
  const isUnread = pageData != null && !readPageIds.has(pageData.page_id);

  return (
    <ForwardRefLink
      ref={itemRef}
      to={getSelectedEntityIdUrl(entityId)}
      role="treeitem"
      aria-selected={isSelected}
      aria-busy={isLoading}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: isSelected,
        [S.treeRowNested]: depth > 0,
      })}
      onMouseEnter={() => handlePrefetch(item)}
      onClick={handleClick}
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
