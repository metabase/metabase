import { useState } from "react";
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
  transform: WorkspaceTransform;
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
    useGetWorkspaceTransformQuery({
      workspaceId,
      transformId: transform.ref_id,
    });

  // Get the latest last_run_at from fetched data or prop
  const lastRunAt =
    fetchedWorkspaceTransform?.last_run_at ?? transform.last_run_at;

  // Run object for RunStatus - shows last run result if available, otherwise last_run_at
  const statusRun: TransformRun | null = lastRunResult
    ? {
        id: -1,
        status: lastRunResult.status,
        start_time: lastRunResult.end_time,
        end_time: lastRunResult.end_time,
        message: lastRunResult.message,
        run_method: "manual",
      }
    : lastRunAt
      ? {
          id: -1,
          status: "succeeded",
          start_time: lastRunAt,
          end_time: lastRunAt,
          message: null,
          run_method: "manual",
        }
      : null;

  // Run object for button - only shows feedback during/after user-triggered runs
  const buttonRun: TransformRun | null = isRunTriggered
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
      : null;

  const handleRun = async () => {
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
      setIsRunTriggered(false);

      // Invalidate caches to refetch updated data
      dispatch(
        workspaceApi.util.invalidateTags([
          { type: "workspace", id: workspaceId },
          { type: "workspace-transform", id: transform.ref_id },
        ]),
      );

      if (result.status === "failed") {
        sendErrorToast(t`Transform run failed`);
      }
    } catch (error) {
      setIsRunTriggered(false);
      setLastRunResult(null);
      sendErrorToast(t`Failed to run transform`);
      console.error("Failed to run transform", error);
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
