import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetWorkspaceTransformQuery,
  useRunWorkspaceTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import type {
  TransformRun,
  WorkspaceId,
  WorkspaceTransform,
} from "metabase-types/api";

type UseWorkspaceTransformRunOptions = {
  workspaceId: WorkspaceId;
  transform: WorkspaceTransform | null;
};

type UseWorkspaceTransformRunResult = {
  /** Run object for RunStatus component - always shows last run info */
  statusRun: TransformRun | null;
  /** Run object for button - only shows feedback during/after user-triggered runs */
  buttonRun: TransformRun | null;
  /** Whether the run status is still loading */
  isRunStatusLoading: boolean;
  /** Whether a run is currently in progress */
  isRunning: boolean;
  /** Trigger a transform run */
  handleRun: () => Promise<void>;
};

export function useWorkspaceTransformRun({
  workspaceId,
  transform,
}: UseWorkspaceTransformRunOptions): UseWorkspaceTransformRunResult {
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();
  const [runTransform] = useRunWorkspaceTransformMutation();

  const [isRunTriggered, setIsRunTriggered] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<{
    status: "succeeded" | "failed";
    end_time: string;
    message: string | null;
  } | null>(null);

  // Fetch workspace transform to get updated last_run_at
  const { data: fetchedWorkspaceTransform, isFetching } =
    useGetWorkspaceTransformQuery(
      {
        workspaceId,
        transformId: transform?.ref_id ?? "",
      },
      { skip: !transform?.ref_id },
    );

  const lastRunAt =
    fetchedWorkspaceTransform?.last_run_at ?? transform?.last_run_at;
  const lastRunMessage =
    fetchedWorkspaceTransform?.last_run_message ?? transform?.last_run_message;
  const lastRunStatus =
    fetchedWorkspaceTransform?.last_run_status ?? transform?.last_run_status;

  const statusRun: TransformRun | null = useMemo(
    () =>
      lastRunResult
        ? {
            id: -1,
            status: lastRunResult.status,
            start_time: lastRunResult.end_time,
            end_time: lastRunResult.end_time,
            message: lastRunResult.message,
            run_method: "manual",
          }
        : lastRunAt && lastRunStatus != null
          ? {
              id: -1,
              status: lastRunStatus,
              start_time: lastRunAt,
              end_time: lastRunAt,
              message: lastRunMessage ?? null,
              run_method: "manual",
            }
          : null,
    [lastRunResult, lastRunAt, lastRunMessage, lastRunStatus],
  );

  // Run object for button - only shows feedback during/after user-triggered runs
  const buttonRun: TransformRun | null = useMemo(
    () =>
      isRunTriggered
        ? {
            id: -1,
            status: "started",
            start_time: new Date().toISOString(),
            end_time: null,
            message: null,
            run_method: "manual",
          }
        : lastRunResult
          ? {
              id: -1,
              status: lastRunResult.status,
              start_time: lastRunResult.end_time,
              end_time: lastRunResult.end_time,
              message: lastRunResult.message,
              run_method: "manual",
            }
          : null,
    [isRunTriggered, lastRunResult],
  );

  const handleRun = async () => {
    if (!transform) {
      return;
    }

    try {
      setIsRunTriggered(true);
      setLastRunResult(null);

      const result = await runTransform({
        workspaceId,
        transformId: transform.ref_id,
      }).unwrap();

      // Transform completed - store the result
      const endTime = result.end_time ?? new Date().toISOString();

      setLastRunResult({
        status: result.status,
        end_time: endTime,
        message: result.message ?? null,
      });

      // Invalidate caches to refetch updated data
      dispatch(
        workspaceApi.util.invalidateTags([
          { type: "workspace", id: workspaceId },
          { type: "workspace-transform", id: transform.ref_id },
          { type: "workspace-tables", id: workspaceId },
        ]),
      );

      if (result.status === "failed") {
        sendErrorToast(t`Transform run failed`);
      }
    } catch (error) {
      sendErrorToast(t`Failed to run transform`);
    } finally {
      setIsRunTriggered(false);
    }
  };

  return {
    statusRun,
    buttonRun,
    isRunStatusLoading: statusRun == null && isFetching,
    isRunning: isRunTriggered,
    handleRun,
  };
}
