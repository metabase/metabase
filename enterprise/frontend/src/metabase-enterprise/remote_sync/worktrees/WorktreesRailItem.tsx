import { useState } from "react";
import { t } from "ttag";

import { AreaTab, AreaTabButton } from "metabase/nav/components/AreaLayout";
import { useLocation } from "metabase/router";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Worktree } from "metabase-types/api";

import { WorktreeDirtyBadge } from "./WorktreeDirtyBadge";
import { WorktreeFilterInput, useWorktreeFilter } from "./WorktreeFilter";
import { findActiveWorktree } from "./utils";

type WorktreesRailItemProps = {
  worktrees: Worktree[];
  onNewWorktree: () => void;
};

/**
 * The collapsed sidebar's single entry for all worktrees. A rail can't tell fifty identical
 * branch icons apart, so the list lives in a flyout instead; the rail item only reflects the
 * worktree the user is currently inside.
 */
export function WorktreesRailItem({
  worktrees,
  onNewWorktree,
}: WorktreesRailItemProps) {
  const { pathname } = useLocation();
  const [isOpened, setIsOpened] = useState(false);
  const activeWorktree = findActiveWorktree(worktrees, pathname);

  const close = () => setIsOpened(false);

  return (
    <Popover
      position="right-start"
      trapFocus
      opened={isOpened}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <AreaTabButton
          label={t`Worktrees`}
          icon="git_branch"
          showLabel={false}
          isSelected={activeWorktree != null}
          onClick={() => setIsOpened(!isOpened)}
          rightSection={
            activeWorktree != null ? (
              <WorktreeDirtyBadge worktreeId={activeWorktree.id} />
            ) : null
          }
        />
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <WorktreesFlyout
          worktrees={worktrees}
          activeWorktree={activeWorktree}
          onNewWorktree={() => {
            close();
            onNewWorktree();
          }}
          onClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type WorktreesFlyoutProps = {
  worktrees: Worktree[];
  activeWorktree: Worktree | undefined;
  onNewWorktree: () => void;
  onClose: () => void;
};

function WorktreesFlyout({
  worktrees,
  activeWorktree,
  onNewWorktree,
  onClose,
}: WorktreesFlyoutProps) {
  const { filter, setFilter, isFilterable, visibleWorktrees } =
    useWorktreeFilter(worktrees);
  const sortedWorktrees = sortActiveFirst(visibleWorktrees, activeWorktree);

  return (
    <Stack gap={0} w={280}>
      <Group justify="space-between" wrap="nowrap" px="md" pt="md" pb="sm">
        <Text fw="bold">{t`Worktrees`}</Text>
        <Tooltip label={t`New worktree`}>
          <ActionIcon
            size="sm"
            aria-label={t`New worktree`}
            onClick={onNewWorktree}
          >
            <Icon name="add" size={12} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {isFilterable && (
        <Box px="sm" pb="sm">
          <WorktreeFilterInput autoFocus value={filter} onChange={setFilter} />
        </Box>
      )}
      <ScrollArea.Autosize mah={320} type="hover">
        <Stack gap={0} px="sm" pb="sm">
          {sortedWorktrees.length === 0 ? (
            <Text c="text-secondary" ta="center" py="md">
              {filter ? t`No worktrees found` : t`No worktrees yet`}
            </Text>
          ) : (
            sortedWorktrees.map((worktree) => (
              <AreaTab
                key={worktree.id}
                label={worktree.branch}
                icon="git_branch"
                to={Urls.dataStudioWorktree(worktree.id)}
                isSelected={worktree.id === activeWorktree?.id}
                showLabel
                rightSection={<WorktreeDirtyBadge worktreeId={worktree.id} />}
                onClick={onClose}
              />
            ))
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function sortActiveFirst(
  worktrees: Worktree[],
  activeWorktree: Worktree | undefined,
) {
  if (activeWorktree == null) {
    return worktrees;
  }
  return [
    ...worktrees.filter((worktree) => worktree.id === activeWorktree.id),
    ...worktrees.filter((worktree) => worktree.id !== activeWorktree.id),
  ];
}
