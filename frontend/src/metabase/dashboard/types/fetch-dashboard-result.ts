import type { Dashboard } from "metabase-types/api";

export type SuccessfulFetchDashboardResult = {
  payload: { dashboard: Dashboard };
};
export type FailedFetchDashboardResult = { error: unknown; payload: unknown };

export type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult;
