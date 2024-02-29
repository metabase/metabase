import type { Dashboard } from "metabase-types/api";

export type SuccessfulFetchDashboardResult = {
  payload: { dashboard: Dashboard };
};
type FailedFetchDashboardResult = { error: unknown; payload: unknown };

export type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult;
