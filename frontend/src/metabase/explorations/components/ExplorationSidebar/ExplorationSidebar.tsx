import cx from "classnames";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { explorationApi } from "metabase/api/exploration";
import { Tree, useTree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getInitialExpandedIds } from "metabase/common/components/tree/utils";
import { trackExplorationVisualizationChanged } from "metabase/explorations/analytics";
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
import {
  ExplorationTreeContext,
  type ExplorationTreeContextValue,
  ExplorationTreeNode,
} from "./ExplorationTreeNode";
import {
  type ExplorationSidebarTabsInfo,
  type ExplorationTreeNode as ExplorationTreeNodeDataType,
  flattenTree,
} from "./utils";

interface ExplorationSidebarProps {
  exploration: Exploration;
  explorationSidebarTabsInfo: ExplorationSidebarTabsInfo;
  selectedSidebarTab: ExplorationSidebarTab;
  getSelectedSidebarTabUrl: (tab: ExplorationSidebarTab) => string;
  tree: ITreeNodeItem<ExplorationTreeNodeDataType>[];
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
    (item: ITreeNodeItem<ExplorationTreeNodeDataType>) => {
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
