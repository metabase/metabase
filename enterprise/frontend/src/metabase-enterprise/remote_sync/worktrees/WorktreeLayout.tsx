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
        <Outlet />
      </Flex>
    </WorktreeProvider>
  );
}
