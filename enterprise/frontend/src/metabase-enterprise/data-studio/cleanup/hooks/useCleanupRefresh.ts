import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { trackDataStudioCleanupRefresh } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import {
  usageMetadataApi,
  useGetUsageMetadataRefreshStatusQuery,
  useStartUsageMetadataRefreshMutation,
} from "metabase-enterprise/api";

const POLLING_INTERVAL = 3000;

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error != null && "status" in error) {
    return error.status;
  }
  return undefined;
}

export function useCleanupRefresh() {
  const dispatch = useDispatch();
  const [isPolling, setIsPolling] = useState(false);
  const previousSnapshotId = useRef<number | null | undefined>(undefined);
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const statusQuery = useGetUsageMetadataRefreshStatusQuery(undefined, {
    pollingInterval: isPolling ? POLLING_INTERVAL : 0,
    skipPollingIfUnfocused: true,
  });
  const [startRefresh, startResult] = useStartUsageMetadataRefreshMutation();
  const status = statusQuery.data;
  const snapshotId = status?.snapshot?.id ?? null;

  useEffect(() => {
    setIsPolling(status?.active != null);
  }, [status?.active]);

  useEffect(() => {
    if (
      previousSnapshotId.current !== undefined &&
      previousSnapshotId.current !== snapshotId
    ) {
      dispatch(
        usageMetadataApi.util.invalidateTags([
          { type: "usage-metadata-candidate", id: "LIST" },
        ]),
      );
      sendSuccessToast(t`Cleanup analysis refreshed`);
    }
    previousSnapshotId.current = snapshotId;
  }, [dispatch, sendSuccessToast, snapshotId]);

  const start = async () => {
    setIsPolling(true);
    try {
      await startRefresh().unwrap();
      trackDataStudioCleanupRefresh("success");
      sendSuccessToast(t`Cleanup analysis started`);
    } catch (error) {
      if (getErrorStatus(error) === 409) {
        trackDataStudioCleanupRefresh("already_running");
      } else {
        trackDataStudioCleanupRefresh("failure");
        setIsPolling(false);
        sendErrorToast(t`Cleanup analysis could not be started`);
      }
      await statusQuery.refetch();
    }
  };

  return {
    status,
    error: statusQuery.error,
    isLoading: statusQuery.isLoading,
    isStarting: startResult.isLoading,
    isRefreshing: status?.active != null || startResult.isLoading,
    start,
    refetch: statusQuery.refetch,
  };
}
