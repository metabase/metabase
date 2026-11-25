import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useConfirmation, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, TreeTableSkeleton } from "metabase/ui";
import {
  useDeleteWorktreeMutation,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { getIsWorktreesVisible } from "../../selectors";

import { CreateWorktreeModal } from "./CreateWorktreeModal";
import { MainBranchSection } from "./MainBranchSection";
import { WorktreeListEmptyState } from "./WorktreeListEmptyState";
import { WorktreeTable } from "./WorktreeTable";
import { useWorktreeCheckout } from "./hooks";

export function WorktreeListPage() {
  const isVisible = useSelector(getIsWorktreesVisible);

  if (!isVisible) {
    return <NotFound />;
  }

  return <WorktreeList />;
}

function WorktreeList() {
  const [isCreateModalOpened, setIsCreateModalOpened] = useState(false);
  const { data: worktrees = [], isLoading, error } = useListWorktreesQuery();
  const [deleteWorktree] = useDeleteWorktreeMutation();
  const { currentWorktreeId, checkout, leave, modal } = useWorktreeCheckout();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const [sendToast] = useToast();

  const handleCreate = async (worktree: RemoteSyncWorktree) => {
    setIsCreateModalOpened(false);
    await checkout(worktree.id);
  };

  const handleCheckout = (worktree: RemoteSyncWorktree) =>
    checkout(worktree.id);

  const handleDelete = (worktree: RemoteSyncWorktree) => {
    showConfirmation({
      title: t`Delete the worktree for ${worktree.branch}?`,
      message: t`Its changes that aren’t pushed are lost. The branch stays in the repository.`,
      confirmButtonText: t`Delete`,
      onConfirm: async () => {
        try {
          await deleteWorktree(worktree.id).unwrap();
        } catch (error) {
          sendToast({
            message: getErrorMessage(error, t`Couldn't delete the worktree`),
            variant: "negative",
          });
        }
      },
    });
  };

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
        <Stack gap="xl">
          <MainBranchSection
            isCheckedOut={currentWorktreeId == null}
            onCheckout={leave}
          />
          <TitleSection
            label={t`Worktrees`}
            description={t`Other branches, checked out next to the main one. Changes stay in a worktree until you push them.`}
            actions={
              <Button
                variant="filled"
                leftSection={<Icon name="add" />}
                onClick={() => setIsCreateModalOpened(true)}
              >{t`New`}</Button>
            }
          >
            {isLoading ? (
              <TreeTableSkeleton columnWidths={[0.3, 0.2, 0.2, 0.25, 0.05]} />
            ) : (
              <WorktreeTable
                worktrees={worktrees}
                currentWorktreeId={currentWorktreeId}
                onCheckout={handleCheckout}
                onDelete={handleDelete}
              />
            )}
          </TitleSection>
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
