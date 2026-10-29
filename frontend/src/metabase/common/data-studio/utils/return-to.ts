import * as Urls from "metabase/urls";
import type { DashboardId } from "metabase-types/api";

/** Router state that sends the main-app dashboard editor back to Data Studio when editing ends */
export type DataStudioReturnState = {
  returnTo: string;
};

export function getDataStudioDashboardReturnState(
  dashboardId: DashboardId,
): DataStudioReturnState {
  return { returnTo: Urls.dataStudioDashboard(dashboardId) };
}

/** Router state that sends the dashboard editor back to `location` when it is a Data Studio page */
export function getDataStudioPageReturnState(location: {
  pathname: string;
  search: string;
}): DataStudioReturnState | undefined {
  const path = `${location.pathname}${location.search}`;
  return isDataStudioPath(path) ? { returnTo: path } : undefined;
}

export function getDataStudioReturnPath(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return undefined;
  }
  const { returnTo } = state;
  return typeof returnTo === "string" && isDataStudioPath(returnTo)
    ? returnTo
    : undefined;
}

function isDataStudioPath(path: string): boolean {
  return path.startsWith(`${Urls.dataStudio()}/`);
}

export function isReturningToDataStudio(location?: {
  state?: unknown;
}): boolean {
  return getDataStudioReturnPath(location?.state) != null;
}
