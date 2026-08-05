import { jt, t } from "ttag";

import { skipToken } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { WorktreeProvider } from "metabase/common/worktrees";
import { useSelector } from "metabase/redux";
import { Outlet, useParams } from "metabase/router";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Group, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useGetRemoteSyncHasChangesQuery,
  useGetWorktreeQuery,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

import S from "./WorktreeLayout.module.css";

export function WorktreeLayout() {
  const params = useParams<{ worktreeId: string }>();
  const worktreeId = Urls.extractEntityId(params.worktreeId);
  const isAdmin = useSelector(getUserIsAdmin);

  const {
    data: worktree,
    isLoading,
    error,
  } = useGetWorktreeQuery(
    isAdmin && worktreeId != null ? worktreeId : skipToken,
  );

  if (worktreeId == null || !isAdmin) {
    return <NotFound />;
  }

  if (isLoading || error != null || worktree == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorktreeProvider worktreeId={worktreeId}>
      <Flex direction="column" h="100%" mih={0}>
        <WorktreeBanner worktree={worktree} />
        <Outlet />
      </Flex>
    </WorktreeProvider>
  );
}

type WorktreeBannerProps = {
  worktree: Worktree;
};

function WorktreeBanner({ worktree }: WorktreeBannerProps) {
  const { data: dirtyData } = useGetRemoteSyncHasChangesQuery({
    "worktree-id": worktree.id,
  });

  return (
    <Group
      justify="space-between"
      px="xl"
      py="sm"
      className={S.banner}
      bg="background_surface-secondary"
    >
      <Group gap="sm">
        <Icon name="git_branch" c="text-secondary" />
        <Text>
          {jt`Working in ${<strong key="branch">{worktree.branch}</strong>}`}
        </Text>
      </Group>
      {dirtyData != null && (
        <Text c="text-secondary" size="sm">
          {dirtyData.is_dirty ? t`Uncommitted changes` : t`Up to date`}
        </Text>
      )}
    </Group>
  );
}
