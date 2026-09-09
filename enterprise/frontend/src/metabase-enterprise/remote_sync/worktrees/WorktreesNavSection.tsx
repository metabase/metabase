import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useHasTokenFeature, useToast } from "metabase/common/hooks";
import { canAccessRemoteSync } from "metabase/current-user";
import { AreaTab, AreaTabGroup } from "metabase/nav/components/AreaLayout";
import type { DataStudioWorktreesSectionProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useLocation, useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useDeleteWorktreeMutation,
  useGetLibraryCollectionQuery,
  useGetRemoteSyncHasChangesQuery,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { Worktree, WorktreeId } from "metabase-types/api";

import { CollectionSyncStatusBadge } from "../components/SyncedCollectionsSidebarSection";

import { NewWorktreeModal } from "./NewWorktreeModal";
import { useWorktreeSyncActions } from "./use-worktree-sync-actions";

export function WorktreesNavSection({
  isNavbarOpened,
}: DataStudioWorktreesSectionProps) {
  const hasRemoteSyncAccess = useSelector(canAccessRemoteSync);
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const canUseWorktrees = hasRemoteSyncAccess && !!isRemoteSyncEnabled;

  const { data: worktrees = [] } = useListWorktreesQuery(undefined, {
    skip: !canUseWorktrees,
  });
  const [isNewModalOpened, { open: openNewModal, close: closeNewModal }] =
    useDisclosure();

  if (!canUseWorktrees) {
    return null;
  }

  return (
    <AreaTabGroup
      label={t`Worktrees`}
      showLabel={isNavbarOpened}
      rightSection={
        <Tooltip label={t`New worktree`}>
          <ActionIcon
            size="sm"
            aria-label={t`New worktree`}
            onClick={openNewModal}
          >
            <Icon name="add" size={12} />
          </ActionIcon>
        </Tooltip>
      }
    >
      {/* an expanded worktree's pages would otherwise sit flush against the next worktree row */}
      <Stack gap="xs">
        {worktrees.map((worktree) => (
          <WorktreeNavItem
            key={worktree.id}
            worktree={worktree}
            isNavbarOpened={isNavbarOpened}
          />
        ))}
      </Stack>
      {isNewModalOpened && <NewWorktreeModal onClose={closeNewModal} />}
    </AreaTabGroup>
  );
}

function isWithin(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

type WorktreeNavItemProps = {
  worktree: Worktree;
  isNavbarOpened: boolean;
};

function WorktreeNavItem({ worktree, isNavbarOpened }: WorktreeNavItemProps) {
  const { pathname } = useLocation();
  const homeUrl = Urls.dataStudioWorktree(worktree.id);
  const transformsUrl = Urls.transformList({ worktreeId: worktree.id });
  const libraryUrl = Urls.dataStudioLibrary({ worktreeId: worktree.id });
  const dependenciesUrl = Urls.dependencyGraph({ worktreeId: worktree.id });
  const isInsideWorktree = isWithin(pathname, homeUrl);
  const isOnHomePage = pathname === homeUrl;
  const [isExpanded, setIsExpanded] = useState(true);

  const hasDependenciesFeature = useHasTokenFeature("dependencies");
  const hasLibraryFeature = useHasTokenFeature("library");
  const { data: libraryCollection } = useGetLibraryCollectionQuery(
    { "worktree-id": worktree.id },
    { skip: !hasLibraryFeature },
  );
  const hasLibrary = libraryCollection != null && "name" in libraryCollection;

  if (!isNavbarOpened) {
    return (
      <AreaTab
        label={worktree.branch}
        icon="git_branch"
        to={homeUrl}
        isSelected={isInsideWorktree}
        showLabel={false}
        rightSection={<WorktreeDirtyBadge worktreeId={worktree.id} />}
      />
    );
  }

  const childrenId = `worktree-${worktree.id}-pages`;

  return (
    <Box>
      <AreaTab
        label={worktree.branch}
        icon="git_branch"
        to={homeUrl}
        // While collapsed, the row stands in for the hidden child pages too.
        isSelected={isOnHomePage || (isInsideWorktree && !isExpanded)}
        showLabel
        leftSection={
          <ActionIcon
            size="xs"
            aria-label={isExpanded ? t`Collapse worktree` : t`Expand worktree`}
            aria-expanded={isExpanded}
            aria-controls={childrenId}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Icon
              name={isExpanded ? "chevrondown" : "chevronright"}
              size={10}
            />
          </ActionIcon>
        }
        rightSection={
          <Group gap="xs" wrap="nowrap">
            <WorktreeDirtyBadge worktreeId={worktree.id} />
            <WorktreeMenu
              worktree={worktree}
              isInsideWorktree={isInsideWorktree}
              isOnHomePage={isOnHomePage}
            />
          </Group>
        }
      />
      <Collapse in={isExpanded} id={childrenId}>
        <Box pl="xl">
          {hasLibrary && (
            <AreaTab
              label={t`Library`}
              icon="repository"
              to={libraryUrl}
              isSelected={isWithin(pathname, libraryUrl)}
              showLabel
            />
          )}
          <AreaTab
            label={t`Transforms`}
            icon="transform"
            to={transformsUrl}
            isSelected={isWithin(pathname, transformsUrl)}
            showLabel
          />
          {hasDependenciesFeature && (
            <AreaTab
              label={t`Dependency graph`}
              icon="dependencies"
              to={dependenciesUrl}
              isSelected={isWithin(pathname, dependenciesUrl)}
              showLabel
            />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function WorktreeDirtyBadge({ worktreeId }: { worktreeId: WorktreeId }) {
  const { data } = useGetRemoteSyncHasChangesQuery({
    "worktree-id": worktreeId,
  });
  return data?.is_dirty ? <CollectionSyncStatusBadge /> : null;
}

type WorktreeMenuProps = {
  worktree: Worktree;
  isInsideWorktree: boolean;
  isOnHomePage: boolean;
};

function WorktreeMenu({
  worktree,
  isInsideWorktree,
  isOnHomePage,
}: WorktreeMenuProps) {
  const [isMenuOpened, setIsMenuOpened] = useState(false);
  const [
    isDeleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure();
  const [deleteWorktree, { isLoading: isDeleting }] =
    useDeleteWorktreeMutation();
  const [sendToast] = useToast();
  const navigate = useNavigate();

  const {
    isDirty,
    hasRemoteChanges,
    isFetchingRemoteChanges,
    isPullDisabled,
    isPushDisabled,
    pull,
    push,
    modals,
  } = useWorktreeSyncActions(worktree, {
    // Only check statuses while the menu is open, so a long sidebar doesn't query per worktree.
    enabled: isMenuOpened,
    // The home page mounts its own instance and reports task progress itself while it is shown.
    showsTaskFeedback: !isOnHomePage,
  });

  const handleDelete = async () => {
    try {
      await deleteWorktree(worktree.id).unwrap();
      closeDeleteModal();
      if (isInsideWorktree) {
        navigate(Urls.transformList());
      }
    } catch {
      sendToast({
        message: t`Failed to delete worktree`,
        icon: "warning",
      });
    }
  };

  return (
    <>
      <Menu
        position="bottom-end"
        opened={isMenuOpened}
        onChange={setIsMenuOpened}
      >
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Worktree options`}>
            <Icon name="ellipsis" size={12} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Tooltip
            label={
              hasRemoteChanges ? t`Pull from remote` : t`No changes to pull`
            }
          >
            <Menu.Item
              leftSection={
                isFetchingRemoteChanges ? (
                  <Loader size={12} data-testid="worktree-menu-pull-loader" />
                ) : (
                  <Icon name="arrow_down" />
                )
              }
              disabled={isPullDisabled || isFetchingRemoteChanges}
              onClick={pull}
            >
              {t`Pull changes`}
            </Menu.Item>
          </Tooltip>
          <Tooltip label={isDirty ? t`Push changes` : t`No changes to push`}>
            <Menu.Item
              leftSection={<Icon name="arrow_up" />}
              disabled={isPushDisabled}
              onClick={push}
            >
              {t`Push changes`}
            </Menu.Item>
          </Tooltip>
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={openDeleteModal}
          >
            {t`Delete worktree`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modals}
      <ConfirmModal
        opened={isDeleteModalOpened}
        title={t`Delete the worktree for "${worktree.branch}"?`}
        message={t`All content checked out into this worktree will be deleted. The branch itself is not affected.`}
        confirmButtonText={t`Delete worktree`}
        confirmButtonProps={{ loading: isDeleting }}
        onConfirm={handleDelete}
        onClose={closeDeleteModal}
      />
    </>
  );
}
