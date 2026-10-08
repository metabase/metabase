import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Navigate, Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

import { useActionDatabases } from "./hooks/use-action-databases";

export function ActionsEnabledOnSomeDatabase() {
  const { databases, isLoading, error } = useActionDatabases();

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (databases.length === 0) {
    return <Navigate to={Urls.dataStudioLibrary()} replace />;
  }

  return <Outlet />;
}
