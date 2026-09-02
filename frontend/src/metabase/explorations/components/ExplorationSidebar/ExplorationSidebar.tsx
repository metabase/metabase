import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { Tree, useTree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getInitialExpandedIds } from "metabase/common/components/tree/utils";
import {
  trackExplorationSidebarTabChanged,
  trackExplorationVisualizationChanged,
} from "metabase/explorations/analytics";
import {
  type ExplorationSidebarTab,
  isExplorationSidebarTab,
} from "metabase/explorations/types";
import { useNavigate } from "metabase/router";
import {
  ActionIcon,
  Box,
  Center,
  Group,
  Icon,
  type IconProps,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { Exploration, ExplorationPageNodeId } from "metabase-types/api";

import type { ExplorationSortOrder } from "../../sidebar-preferences";
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";

import S from "./ExplorationSidebar.module.css";
import { ExplorationSidebarSkeleton } from "./ExplorationSidebarSkeleton";
import {
  ExplorationTreeContext,
  type ExplorationTreeContextValue,
  ExplorationTreeNode,
} from "./ExplorationTreeNode";
import {
  EXPLORATION_SUMMARY_TREE_ID,
  type ExplorationSidebarContentMode,
  type ExplorationSidebarTabsInfo,
  type ExplorationTreeNode as ExplorationTreeNodeDataType,
  type SelectedSidebarEntity,
  flattenTree,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  explorationSidebarTabsInfo: ExplorationSidebarTabsInfo;
  selectedSidebarTab: ExplorationSidebarTab;
  getSelectedSidebarTabUrl: (tab: ExplorationSidebarTab) => string;
  tree: ITreeNodeItem<ExplorationTreeNodeDataType>[];
  selectedEntity: SelectedSidebarEntity | null;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
  getSelectedSummaryUrl: () => string;
  shouldScrollSelectionRef: React.MutableRefObject<boolean>;
  isOpen: boolean;
  readPageIds: ReadonlySet<string>;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  sortOrder: ExplorationSortOrder;
  onChangeSortOrder: (sortOrder: ExplorationSortOrder) => void;
  contentMode: ExplorationSidebarContentMode;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPrefetchPage: (pageId: ExplorationPageNodeId) => void;
}

export function ExplorationSidebar({
  exploration,
  explorationSidebarTabsInfo,
  selectedSidebarTab,
  getSelectedSidebarTabUrl,
  tree,
  selectedEntity,
  getSelectedPageUrl,
  getSelectedSummaryUrl,
  shouldScrollSelectionRef,
  isOpen,
  readPageIds,
  showHidden,
  onToggleShowHidden,
  sortOrder,
  onChangeSortOrder,
  contentMode,
  onPreviousPage,
  onNextPage,
  onPrefetchPage,
}: ExplorationSidebarProps) {
  const navigate = useNavigate();
  const selectedTreeId =
    selectedEntity?.type === "page"
      ? selectedEntity.id
      : selectedEntity?.type === "summary"
        ? EXPLORATION_SUMMARY_TREE_ID
        : undefined;
  const treeController = useTree({
    data: tree,
    selectedId: selectedTreeId,
    freezeAutoExpandOnManualToggle: true,
  });

  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  // `collapse` is stable, but treeController is not
  // so we need to be careful to prevent this effect from running on every render
  // eslint complains when passing `treeController.collapse` to `useEffect` deps
  // so destructure it
  const { collapse, setExpandedIds } = treeController;

  // When programmatic navigation sets shouldScrollSelectionRef, also expand
  // the tree to reveal the selected item. useTree's auto-expand is frozen
  // after a manual chevron toggle, so we bypass it here.
  useEffect(() => {
    if (shouldScrollSelectionRef.current && selectedTreeId) {
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(selectedTreeId, tree)]),
      );
    }
  }, [selectedTreeId, shouldScrollSelectionRef, setExpandedIds, tree]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Arrow keys skip the Summary (flattenTree is page-only).
      if (selectedEntity?.type !== "page") {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextItem = getAdjacentById(flatItems, selectedEntity.id, direction);
      if (
        nextItem == null ||
        nextItem.id === selectedEntity.id ||
        nextItem.data?.type !== "page"
      ) {
        return;
      }
      if (direction === 1) {
        onNextPage();
      } else {
        onPreviousPage();
      }
      trackExplorationVisualizationChanged(exploration.id, "keyboard");
      event.preventDefault();
      shouldScrollSelectionRef.current = true;
      setExpandedIds(
        (prev) =>
          new Set([...prev, ...getInitialExpandedIds(nextItem.id, tree)]),
      );
      // if we moved into a different folder, collapse the previous folder
      const currentItem = flatItems.find(
        (item) => item.id === selectedEntity.id,
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
    onPreviousPage,
    onNextPage,
    selectedEntity,
    setExpandedIds,
    collapse,
    exploration.id,
    shouldScrollSelectionRef,
  ]);

  const treeContextValue = useMemo<ExplorationTreeContextValue>(
    () => ({
      explorationId: exploration.id,
      canWrite: exploration.can_write,
      onPrefetchPage,
      shouldScrollSelectionRef,
      getSelectedPageUrl,
      getSelectedSummaryUrl,
      readPageIds,
    }),
    [
      exploration.id,
      exploration.can_write,
      onPrefetchPage,
      shouldScrollSelectionRef,
      getSelectedPageUrl,
      getSelectedSummaryUrl,
      readPageIds,
    ],
  );

  if (!isOpen) {
    // we still want keyboard shortcuts to work, so the component should still be mounted
    return null;
  }

  const emptyTreeMessage =
    explorationSidebarTabsInfo[selectedSidebarTab].emptyTreeMessage;

  let treeContent: React.ReactNode;
  switch (contentMode) {
    case "loading":
      treeContent = <ExplorationSidebarSkeleton />;
      break;
    case "forbidden":
      treeContent = (
        <Center flex={1} pl="0.5rem" pr="1rem" pb="3rem">
          <Text fz="lg">
            {t`You don't have permission to view these results.`}
          </Text>
        </Center>
      );
      break;
    case "all-hidden":
      treeContent = (
        <Center flex={1} pl="0.5rem" pr="1rem" pb="3rem">
          <Text
            c="text-secondary"
            fs="italic"
            data-testid="exploration-all-hidden"
          >
            {t`All items have been hidden.`}
          </Text>
        </Center>
      );
      break;
    case "tree":
      treeContent = (
        <Box flex={1} data-testid="exploration-page-sidebar" className={S.tree}>
          <ExplorationTreeContext.Provider value={treeContextValue}>
            <Tree
              role="tree"
              tree={treeController}
              TreeNode={ExplorationTreeNode}
              wrapNodesInListItem
            />
          </ExplorationTreeContext.Provider>
        </Box>
      );
      break;
    case "empty":
      treeContent = (
        <Center flex={1} pl="0.5rem" pr="1rem" pb="3rem">
          <Text fz="lg">{emptyTreeMessage}</Text>
        </Center>
      );
      break;
  }

  return (
    <Stack h="100%" w="20%" miw="20.5rem" flex="none" mr="2rem">
      <Group pl="0.5rem" gap="lg" wrap="nowrap" align="center">
        <Box flex={1} miw={0}>
          <SegmentedControl<ExplorationSidebarTab>
            fullWidth
            radius="xl"
            bg="background-tertiary"
            value={selectedSidebarTab}
            onChange={(value) => {
              if (
                isExplorationSidebarTab(value) &&
                value !== selectedSidebarTab
              ) {
                trackExplorationSidebarTabChanged(exploration.id, value);
                navigate(getSelectedSidebarTabUrl(value));
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
      {treeContent}
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
