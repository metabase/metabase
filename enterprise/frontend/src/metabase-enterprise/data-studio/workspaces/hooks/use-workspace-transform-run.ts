import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
  useGetWorkspaceTablesQuery,
  useGetWorkspaceTransformQuery,
  useRunWorkspaceTransformMutation,
  workspaceApi,
} from "metabase-enterprise/api";
import type {
  DatabaseId,
  SchemaName,
  TableId,
  TransformRun,
  WorkspaceId,
  WorkspaceTransform,
} from "metabase-types/api";

type UseWorkspaceTransformRunOptions = {
  workspaceId: WorkspaceId;
  transform: WorkspaceTransform;
};

type OutputTableInfo = {
  db_id: DatabaseId;
  table_id: TableId | null;
  table_name: string;
  schema: SchemaName;
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
  output: OutputTableInfo | null;
};

export function useWorkspaceTransformRun({
  workspaceId,
  transform,
}: UseWorkspaceTransformRunOptions): UseWorkspaceTransformRunResult {
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();
  const [runTransform] = useRunWorkspaceTransformMutation();
  const { data: workspaceTables = DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE } =
    useGetWorkspaceTablesQuery(workspaceId);

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
        transformId: transform.ref_id,
      },
      { skip: !transform.ref_id },
    );

  const lastRunAt =
    fetchedWorkspaceTransform?.last_run_at ?? transform.last_run_at;
  const lastRunMessage =
    fetchedWorkspaceTransform?.last_run_message ?? transform.last_run_message;
  const lastRunStatus =
    fetchedWorkspaceTransform?.last_run_status ?? transform.last_run_status;

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
        : lastRunAt
          ? {
              id: -1,
              status: lastRunStatus,
              start_time: lastRunAt,
              end_time: lastRunAt,
              message: lastRunMessage,
              run_method: "manual",
            }
          : null,
    [lastRunResult, lastRunAt, lastRunMessage, lastRunStatus],
  );

  const output = useMemo<OutputTableInfo | null>(() => {
    const table = workspaceTables.outputs.find(
      (table) => table.isolated.transform_id === transform.ref_id,
    );
    if (!table || statusRun?.status !== "succeeded") {
      return null;
    }
    return {
      db_id: table.db_id,
      table_id: table.isolated.table_id,
      table_name: table.isolated.table,
      schema: table.isolated.schema,
    };
  }, [workspaceTables, transform.ref_id, statusRun]);

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
          { type: "workspace-tables", id: workspaceId },
        ]),
      );

      if (result.status === "failed") {
        sendErrorToast(t`Transform run failed`);
      }
    } catch (error) {
      setIsRunTriggered(false);
      setLastRunResult(null);
      sendErrorToast(t`Failed to run transform`);
    }
  };

  return {
    statusRun,
    buttonRun,
    isRunStatusLoading: statusRun == null && isFetching,
    isRunning: isRunTriggered,
    handleRun,
    output,
  };
}
