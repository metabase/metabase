import type { MouseEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { DateTime } from "metabase/common/components/DateTime";
import { NotFound } from "metabase/common/components/ErrorPages";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useConfirmation, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import {
  Button,
  Card,
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Icon,
  Menu,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import {
  useDeleteWorktreeMutation,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { Worktree, WorktreeId } from "metabase-types/api";

import { CreateWorktreeModal } from "../../components/CreateWorktreeModal";
import { useWorktreeCheckout } from "../../hooks/use-worktree-checkout";
import { getIsRemoteSyncVisible } from "../../selectors";

export function WorktreeListPage() {
  const isVisible = useSelector(getIsRemoteSyncVisible);

  if (!isVisible) {
    return <NotFound />;
  }

  return <WorktreeList />;
}

function WorktreeList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpened, setIsCreateModalOpened] = useState(false);
  const { data: worktrees = [], isLoading, error } = useListWorktreesQuery();
  const [deleteWorktree] = useDeleteWorktreeMutation();
  const { currentWorktreeId, checkout, leave, modal } = useWorktreeCheckout();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const [sendToast] = useToast();

  const handleCreate = async (worktree: Worktree) => {
    setIsCreateModalOpened(false);
    await checkout(worktree.id);
  };

  const handleLeave = () => {
    showConfirmation({
      title: t`Leave the worktree?`,
      message: t`You’ll go back to the main branch. Your changes stay in the worktree.`,
      confirmButtonText: t`Leave`,
      confirmButtonProps: { color: "brand" },
      onConfirm: leave,
    });
  };

  const handleDelete = (worktree: Worktree) => {
    showConfirmation({
      title: t`Delete the worktree for ${worktree.branch}?`,
      message: t`Its changes that aren’t pushed are lost. The branch stays in the repository.`,
      confirmButtonText: t`Delete`,
      onConfirm: async () => {
        try {
          await deleteWorktree(worktree.id).unwrap();
          if (worktree.id === currentWorktreeId) {
            window.location.reload();
          }
        } catch (error) {
          sendToast({
            message: getErrorMessage(error, t`Couldn't delete the worktree`),
            variant: "negative",
          });
        }
      },
    });
  };

  const columns: TreeTableColumnDef<Worktree>[] = [
    {
      id: "branch",
      accessorKey: "branch",
      header: t`Branch`,
      enableSorting: true,
      minWidth: 160,
      cell: ({ row }) => (
        <Flex align="center" gap="sm" miw={0}>
          <FixedSizeIcon name="git_branch" />
          <Ellipsified>{row.original.branch}</Ellipsified>
        </Flex>
      ),
    },
    {
      id: "created-by",
      accessorFn: (worktree) => getUserName(worktree.creator ?? undefined),
      header: t`Created by`,
      enableSorting: true,
      minWidth: 120,
      cell: ({ row }) => (
        <Ellipsified>
          {getUserName(row.original.creator ?? undefined)}
        </Ellipsified>
      ),
    },
    {
      id: "created-at",
      accessorKey: "created_at",
      header: t`Created at`,
      enableSorting: true,
      minWidth: 150,
      cell: ({ row }) => (
        <DateTime value={row.original.created_at} unit="day" />
      ),
    },
    {
      id: "checked-out-by",
      accessorFn: (worktree) => getCheckedOutBy(worktree),
      header: t`Checked out by`,
      enableSorting: true,
      minWidth: 160,
      cell: ({ row }) => (
        <Ellipsified>{getCheckedOutBy(row.original)}</Ellipsified>
      ),
    },
    {
      id: "actions",
      header: "",
      width: 48,
      cell: ({ row }) => (
        <WorktreeRowMenu
          worktree={row.original}
          isCheckedOut={row.original.id === currentWorktreeId}
          onCheckout={checkout}
          onDelete={handleDelete}
        />
      ),
    },
  ];

  const treeTableInstance = useTreeTableInstance({
    data: worktrees,
    columns,
    getNodeId: (worktree) => String(worktree.id),
    enableSorting: true,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const isEmpty = !isLoading && worktrees.length === 0;

  return (
    <PageContainer data-testid="worktree-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Worktrees`}</DataStudioBreadcrumbs>
        }
      />
      {isEmpty ? (
        <WorktreeListEmptyState onCreate={() => setIsCreateModalOpened(true)} />
      ) : (
        <Stack style={{ overflow: "hidden" }}>
          <Flex gap="lg">
            <TextInput
              placeholder={t`Search...`}
              leftSection={<Icon name="search" />}
              bdrs="sm"
              flex="1"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button
              size="lg"
              leftSection={<Icon name="add" />}
              onClick={() => setIsCreateModalOpened(true)}
            >{t`New`}</Button>
            <WorktreePageMenu
              isInWorktree={currentWorktreeId != null}
              onLeave={handleLeave}
            />
          </Flex>
          <Flex direction="column" flex={1} mih={0}>
            <Card withBorder p={0}>
              {isLoading ? (
                <TreeTableSkeleton columnWidths={[0.3, 0.2, 0.2, 0.25, 0.05]} />
              ) : (
                <TreeTable
                  instance={treeTableInstance}
                  emptyState={
                    searchQuery ? (
                      <ListEmptyState label={t`No worktrees found`} />
                    ) : null
                  }
                />
              )}
            </Card>
          </Flex>
        </Stack>
      )}
      <CreateWorktreeModal
        opened={isCreateModalOpened}
        onCreate={handleCreate}
        onClose={() => setIsCreateModalOpened(false)}
      />
      {confirmationModal}
      {modal}
    </PageContainer>
  );
}

function getCheckedOutBy(worktree: Worktree) {
  return (worktree.users ?? []).map((user) => getUserName(user)).join(", ");
}

type WorktreeListEmptyStateProps = {
  onCreate: () => void;
};

function WorktreeListEmptyState({ onCreate }: WorktreeListEmptyStateProps) {
  return (
    <FeatureEmptyState
      title={t`Work on a branch without touching the main one`}
      description={t`A worktree checks out a branch of your repository next to the main one. Make changes there, push them, and merge them when they’re ready.`}
      actions={
        <Flex>
          <Button variant="filled" onClick={onCreate}>
            {t`Create a worktree`}
          </Button>
        </Flex>
      }
      features={[
        {
          icon: "git_branch",
          title: t`Any branch`,
          description: t`Check out an existing branch or create a new one`,
        },
        {
          icon: "lock",
          title: t`Isolated`,
          description: t`Changes stay in the worktree until you push them`,
        },
        {
          icon: "arrow_down",
          title: t`Pull and push`,
          description: t`Sync the worktree with its branch like the main one`,
        },
        {
          icon: "person",
          title: t`Shared`,
          description: t`Several admins can work in the same worktree`,
        },
      ]}
    />
  );
}

type WorktreePageMenuProps = {
  isInWorktree: boolean;
  onLeave: () => void;
};

function WorktreePageMenu({ isInWorktree, onLeave }: WorktreePageMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          size="lg"
          aria-label={t`Worktree options`}
          leftSection={<Icon name="ellipsis" />}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FixedSizeIcon name="exit" />}
          disabled={!isInWorktree}
          onClick={onLeave}
        >
          {t`Leave the worktree`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type WorktreeRowMenuProps = {
  worktree: Worktree;
  isCheckedOut: boolean;
  onCheckout: (worktreeId: WorktreeId) => void;
  onDelete: (worktree: Worktree) => void;
};

function WorktreeRowMenu({
  worktree,
  isCheckedOut,
  onCheckout,
  onDelete,
}: WorktreeRowMenuProps) {
  const handleTargetClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <MoreMenuButton
          aria-label={t`Worktree options`}
          onClick={handleTargetClick}
        />
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item
          leftSection={<FixedSizeIcon name="git_branch" />}
          disabled={isCheckedOut}
          onClick={() => onCheckout(worktree.id)}
        >
          {t`Check out`}
        </Menu.Item>
        <Menu.Item
          leftSection={<FixedSizeIcon name="trash" />}
          c="feedback-negative"
          onClick={() => onDelete(worktree)}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
