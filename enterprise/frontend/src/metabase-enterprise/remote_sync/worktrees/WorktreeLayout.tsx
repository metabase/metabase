import { skipToken } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { WorktreeProvider } from "metabase/common/worktrees";
import { useSelector } from "metabase/redux";
import { Outlet, useParams } from "metabase/router";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetWorktreeQuery } from "metabase-enterprise/api";

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
        {/* <WorktreeBanner worktree={worktree} /> */}
        <Outlet />
      </Flex>
    </WorktreeProvider>
  );
}

/* Branch banner with sync status, currently disabled — the worktree's sidebar menu
   (WorktreesNavSection) carries the sync actions and owns the task feedback. If this comes back,
   move task-feedback ownership back here (see ownsTaskFeedback in WorktreeMenu).

import { jt } from "ttag";
import { Group, Icon, Text } from "metabase/ui";
import type { Worktree } from "metabase-types/api";
import S from "./WorktreeLayout.module.css";
import { WorktreeSyncControls } from "./WorktreeSyncControls";

type WorktreeBannerProps = {
  worktree: Worktree;
};

function WorktreeBanner({ worktree }: WorktreeBannerProps) {
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
      <WorktreeSyncControls worktree={worktree} />
    </Group>
  );
}
*/
