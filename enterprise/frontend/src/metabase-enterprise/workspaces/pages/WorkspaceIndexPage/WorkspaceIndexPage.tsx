import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

import { canManageWorkspaces } from "../../selectors";
import { CurrentWorkspacePage } from "../CurrentWorkspacePage";
import { WorkspaceListPage } from "../WorkspaceListPage";

export function WorkspaceIndexPage() {
  const canManageInstance = useSelector(canManageWorkspaces);

  const {
    data: workspace,
    isLoading,
    error,
  } = useGetCurrentWorkspaceQuery(undefined, { skip: !canManageInstance });

  if (isLoading || error != null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (workspace != null && canManageInstance) {
    return <CurrentWorkspacePage />;
  }

  return <WorkspaceListPage />;
}
