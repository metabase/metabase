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

export function getDataStudioReturnPath(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return undefined;
  }
  const { returnTo } = state;
  return typeof returnTo === "string" &&
    returnTo.startsWith(`${Urls.dataStudio()}/`)
    ? returnTo
    : undefined;
}

export function isReturningToDataStudio(location?: {
  state?: unknown;
}): boolean {
  return getDataStudioReturnPath(location?.state) != null;
}
