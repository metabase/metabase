import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useToast } from "metabase/common/hooks";
import { AreaTab, AreaTabGroup } from "metabase/nav/components/AreaLayout";
import type { DataStudioWorktreesSectionProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useLocation, useNavigate } from "metabase/router";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  Collapse,
  FixedSizeIcon,
  Flex,
  Icon,
  Menu,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useDeleteWorktreeMutation,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

import { NewWorktreeModal } from "./NewWorktreeModal";

export function WorktreesNavSection({
  isNavbarOpened,
}: DataStudioWorktreesSectionProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const canUseWorktrees = isAdmin && !!isRemoteSyncEnabled;

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
      {worktrees.map((worktree) => (
        <WorktreeNavItem
          key={worktree.id}
          worktree={worktree}
          isNavbarOpened={isNavbarOpened}
        />
      ))}
      {isNewModalOpened && <NewWorktreeModal onClose={closeNewModal} />}
    </AreaTabGroup>
  );
}

type WorktreeNavItemProps = {
  worktree: Worktree;
  isNavbarOpened: boolean;
};

function WorktreeNavItem({ worktree, isNavbarOpened }: WorktreeNavItemProps) {
  const { pathname } = useLocation();
  const transformsUrl = Urls.transformList({ worktreeId: worktree.id });
  const isInsideWorktree = pathname.startsWith(
    `${Urls.dataStudioWorktrees()}/${worktree.id}`,
  );
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isNavbarOpened) {
    return (
      <AreaTab
        label={worktree.branch}
        icon="git_branch"
        to={transformsUrl}
        isSelected={isInsideWorktree}
        showLabel={false}
      />
    );
  }

  return (
    <Box>
      <Flex align="center" gap="xs" p="sm" pb={0}>
        <ActionIcon
          size="xs"
          aria-label={isExpanded ? t`Collapse worktree` : t`Expand worktree`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Icon name={isExpanded ? "chevrondown" : "chevronright"} size={10} />
        </ActionIcon>
        <FixedSizeIcon name="git_branch" c="text-secondary" />
        <Text lh="sm" flex={1} truncate title={worktree.branch}>
          {worktree.branch}
        </Text>
        <WorktreeMenu worktree={worktree} isInsideWorktree={isInsideWorktree} />
      </Flex>
      <Collapse in={isExpanded}>
        <Box pl="xl" pt="xs">
          <AreaTab
            label={t`Transforms`}
            icon="transform"
            to={transformsUrl}
            isSelected={pathname.startsWith(transformsUrl)}
            showLabel
          />
        </Box>
      </Collapse>
    </Box>
  );
}

type WorktreeMenuProps = {
  worktree: Worktree;
  isInsideWorktree: boolean;
};

function WorktreeMenu({ worktree, isInsideWorktree }: WorktreeMenuProps) {
  const [
    isDeleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure();
  const [deleteWorktree, { isLoading: isDeleting }] =
    useDeleteWorktreeMutation();
  const [sendToast] = useToast();
  const navigate = useNavigate();

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
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            size="sm"
            aria-label={t`Worktree options`}
            onClick={(event) => event.preventDefault()}
          >
            <Icon name="ellipsis" size={12} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={openDeleteModal}
          >
            {t`Delete worktree`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
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
