import { useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useWorktreeId } from "metabase/common/worktrees";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Button, Group, Icon } from "metabase/ui";
import {
  useGetRemoteSyncChangesQuery,
  useGetRemoteSyncLastTaskQuery,
  useGetWorktreeQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncEntity, Worktree } from "metabase-types/api";

import { useWorktreeSyncActions } from "../use-worktree-sync-actions";

import { WorktreeChangesList } from "./WorktreeChangesList";
import { WorktreeStatusCards } from "./WorktreeStatusCards";
import { countChanges } from "./utils";

const NO_CHANGES: RemoteSyncEntity[] = [];

export function WorktreeHomePage() {
  const worktreeId = useWorktreeId();
  const { data: worktree } = useGetWorktreeQuery(worktreeId ?? skipToken);
  usePageTitle(worktree?.branch ?? t`Worktree`);

  // WorktreeLayout only renders its pages once the worktree has loaded, so this is a formality.
  if (worktree == null) {
    return <LoadingAndErrorWrapper loading />;
  }

  return <WorktreeOverview worktree={worktree} />;
}

function WorktreeOverview({ worktree }: { worktree: Worktree }) {
  const worktreeId = worktree.id;

  const {
    data: changesData,
    isLoading: isLoadingChanges,
    error: changesError,
  } = useGetRemoteSyncChangesQuery(
    { "worktree-id": worktreeId },
    { refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  const { data: lastTask, isLoading: isLoadingLastTask } =
    useGetRemoteSyncLastTaskQuery(
      { "worktree-id": worktreeId },
      { refetchOnMountOrArgChange: true },
    );

  const {
    hasRemoteChanges,
    isFetchingRemoteChanges,
    isReadOnly,
    isSyncing,
    isPullDisabled,
    isPushDisabled,
    pull,
    push,
    modals,
  } = useWorktreeSyncActions(worktree);

  const entities = changesData?.dirty ?? NO_CHANGES;
  const counts = useMemo(() => countChanges(entities), [entities]);

  return (
    <PageContainer data-testid="worktree-home-page" gap="xl">
      <PaneHeader
        py={0}
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Overview`}</DataStudioBreadcrumbs>
        }
        title={
          <PanelHeaderTitle>
            <span data-testid="worktree-home-title">{worktree.branch}</span>
          </PanelHeaderTitle>
        }
        actions={
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<Icon name="arrow_down" />}
              disabled={isPullDisabled || isFetchingRemoteChanges}
              loading={isSyncing}
              onClick={pull}
            >
              {t`Pull changes`}
            </Button>
            {!isReadOnly && (
              <Button
                variant="filled"
                leftSection={<Icon name="arrow_up" />}
                disabled={isPushDisabled}
                onClick={push}
              >
                {t`Push changes`}
              </Button>
            )}
          </Group>
        }
      />

      <WorktreeStatusCards
        worktree={worktree}
        counts={counts}
        isLoadingChanges={isLoadingChanges}
        hasRemoteChanges={hasRemoteChanges}
        isCheckingRemote={isFetchingRemoteChanges}
        isSyncing={isSyncing}
        lastTask={lastTask}
        isLoadingLastTask={isLoadingLastTask}
      />

      <WorktreeChangesList
        worktreeId={worktreeId}
        branch={worktree.branch}
        entities={entities}
        counts={counts}
        isLoading={isLoadingChanges}
        error={changesError}
      />

      {modals}
    </PageContainer>
  );
}
