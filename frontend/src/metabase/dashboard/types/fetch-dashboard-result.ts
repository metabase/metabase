import type { Dashboard } from "metabase-types/api";

type SuccessfulFetchDashboardResult = {
  payload: { dashboard: Dashboard };
};

type CancelledFetchDashboardResult = {
  payload: { isCancelled: true };
};

export type FailedFetchDashboardResult = { error: unknown; payload: unknown };

export type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult
  | CancelledFetchDashboardResult;
