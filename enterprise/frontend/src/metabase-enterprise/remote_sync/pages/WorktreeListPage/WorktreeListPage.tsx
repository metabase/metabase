import { useState } from "react";
import { t } from "ttag";

import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, TreeTableSkeleton } from "metabase/ui";
import { useListWorktreesQuery } from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { getIsWorktreesVisible } from "../../selectors";

import { CreateWorktreeModal } from "./CreateWorktreeModal";
import { DeleteWorktreeModal } from "./DeleteWorktreeModal";
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
  const [worktreeToDelete, setWorktreeToDelete] =
    useState<RemoteSyncWorktree | null>(null);
  const { data: worktrees = [], isLoading, error } = useListWorktreesQuery();
  const { currentWorktreeId, checkout, leave, checkoutModal } =
    useWorktreeCheckout();

  const handleCreate = async (worktree: RemoteSyncWorktree) => {
    setIsCreateModalOpened(false);
    await checkout(worktree.id);
  };

  const handleCheckout = (worktree: RemoteSyncWorktree) =>
    checkout(worktree.id);

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
                onDelete={setWorktreeToDelete}
              />
            )}
          </TitleSection>
        </Stack>
      )}
      <CreateWorktreeModal
        opened={isCreateModalOpened}
        isFirstWorktree={worktrees.length === 0}
        onCreate={handleCreate}
        onClose={() => setIsCreateModalOpened(false)}
      />
      {worktreeToDelete != null && (
        <DeleteWorktreeModal
          worktree={worktreeToDelete}
          isLastWorktree={worktrees.length === 1}
          onDelete={() => setWorktreeToDelete(null)}
          onClose={() => setWorktreeToDelete(null)}
        />
      )}
      {checkoutModal}
    </PageContainer>
  );
}
