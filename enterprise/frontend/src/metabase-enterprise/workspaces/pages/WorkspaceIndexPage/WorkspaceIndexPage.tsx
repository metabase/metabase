import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

import { canManageWorkspaceInstance } from "../../selectors";
import { WorkspaceInstancePage } from "../WorkspaceInstancePage";
import { WorkspaceListPage } from "../WorkspaceListPage";

export function WorkspaceIndexPage() {
  const canManageInstance = useSelector(canManageWorkspaceInstance);

  const {
    data: workspace,
    isLoading,
    error,
  } = useGetCurrentWorkspaceQuery(undefined, { skip: !canManageInstance });

  if (isLoading || error != null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (workspace != null && canManageInstance) {
    return <WorkspaceInstancePage />;
  }

  return <WorkspaceListPage />;
}
