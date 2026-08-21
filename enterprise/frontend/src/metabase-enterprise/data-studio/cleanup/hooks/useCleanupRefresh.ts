import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { trackDataStudioCleanupRefreshStarted } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import {
  usageMetadataApi,
  useGetUsageMetadataRefreshStatusQuery,
  useStartUsageMetadataRefreshMutation,
} from "metabase-enterprise/api";

import { getErrorStatus } from "../utils";

const POLLING_INTERVAL = 3000;

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
  const isActive = status?.active != null;

  // Adjust during render, not via a useEffect keyed on status?.active: if active is
  // null both before start() and after the post-start refetch, that dependency never
  // changes, so an effect would never fire and isPolling would stay stuck on true.
  if (isPolling !== isActive) {
    setIsPolling(isActive);
  }

  useEffect(() => {
    if (!statusQuery.isSuccess) {
      return;
    }

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
  }, [dispatch, sendSuccessToast, snapshotId, statusQuery.isSuccess]);

  const start = async () => {
    try {
      await startRefresh().unwrap();
      trackDataStudioCleanupRefreshStarted("success");
      sendSuccessToast(t`Cleanup analysis started`);
    } catch (error) {
      if (getErrorStatus(error) === 409) {
        trackDataStudioCleanupRefreshStarted("already_running");
      } else {
        trackDataStudioCleanupRefreshStarted("failure");
        sendErrorToast(t`Cleanup analysis could not be started`);
      }
    } finally {
      // pick up the fresh active state immediately instead of waiting for the next
      // poll tick, which wouldn't be scheduled yet if this request settled with
      // active still null (e.g. the 409 "already running" race)
      await statusQuery.refetch();
    }
  };

  return {
    status,
    isStarting: startResult.isLoading,
    isRefreshing: isActive || startResult.isLoading,
    start,
  };
}
