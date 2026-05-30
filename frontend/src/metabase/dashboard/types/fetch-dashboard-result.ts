import type { AbortError } from "metabase/api/legacy-client";
import type { Dashboard } from "metabase-types/api";

type SuccessfulFetchDashboardResult = {
  payload: { dashboard: Dashboard };
};

// A cancelled fetch surfaces as an `AbortError` payload. It also satisfies
// `FailedFetchDashboardResult` shape-wise, so consumers use
// `isAbortError(result.payload)` to distinguish.
type CancelledFetchDashboardResult = {
  payload: AbortError;
};

export type FailedFetchDashboardResult = { error: unknown; payload: unknown };

export type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult
  | CancelledFetchDashboardResult;
