import { skipToken } from "@reduxjs/toolkit/query";

import { useGetTableIndexRequestQuery } from "metabase/api";
import type {
  IndexRequestDetails,
  IndexRequestId,
  TableId,
} from "metabase-types/api";

const POLL_INTERVAL_MS = 2000;

function isInFlight(status: IndexRequestDetails["status"] | undefined) {
  return status === "pending" || status === "running";
}

export function useIndexRequestStatus(
  tableId: TableId,
  requestId: IndexRequestId | null | undefined,
): {
  request: IndexRequestDetails | undefined;
  isPolling: boolean;
} {
  const result = useGetTableIndexRequestQuery(
    requestId == null ? skipToken : { tableId, requestId },
  );
  const inFlight = isInFlight(result.data?.status);
  // Re-query at interval while pending/running. RTK Query handles
  // re-render → re-evaluation, so the polling stops on terminal status.
  useGetTableIndexRequestQuery(
    requestId == null || !inFlight ? skipToken : { tableId, requestId },
    { pollingInterval: POLL_INTERVAL_MS },
  );
  return { request: result.data, isPolling: inFlight };
}
