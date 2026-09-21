import type { Dashboard } from "metabase-types/api";

type SuccessfulFetchDashboardResult = {
  payload: { dashboard: Dashboard };
};

// A cancelled fetch surfaces as a `payload` matching the standard
// `DOMException` AbortError shape. It also satisfies
// `FailedFetchDashboardResult` shape-wise, so consumers use
// `isAbortError(result.payload)` to distinguish.
type CancelledFetchDashboardResult = {
  payload: { name: "AbortError" };
};

export type FailedFetchDashboardResult = { error: unknown; payload: unknown };

export type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult
  | CancelledFetchDashboardResult;
