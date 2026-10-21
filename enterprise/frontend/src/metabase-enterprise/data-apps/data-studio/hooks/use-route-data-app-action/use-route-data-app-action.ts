import { useActionDatabases } from "metabase/data-studio/actions/hooks/use-action-databases";
import { useRouteAction } from "metabase/data-studio/actions/hooks/use-route-action";

import { useRouteDataApp } from "../use-route-data-app";

export function useRouteDataAppAction() {
  const { app, isLoading: isLoadingApp, error: appError } = useRouteDataApp();
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();

  return {
    app,
    action,
    databases,
    isLoading: isLoadingApp || isLoadingAction || isLoadingDatabases,
    error: appError ?? actionError ?? databasesError,
  };
}
