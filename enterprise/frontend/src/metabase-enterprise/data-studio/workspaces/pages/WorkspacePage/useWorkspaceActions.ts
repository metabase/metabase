import { useCallback, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useLazyGetWorkspaceTransformQuery,
  useMergeWorkspaceMutation,
  useRunWorkspaceTransformMutation,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type {
  Workspace,
  WorkspaceTablesResponse,
  WorkspaceTransformItem,
} from "metabase-types/api";

import type { OpenTable, WorkspaceTab } from "./WorkspaceProvider";

type UseWorkspaceActionsParams = {
  workspaceId: number;
  workspace: Workspace | undefined;
  refetchWorkspaceTables: () => Promise<{ data?: WorkspaceTablesResponse }>;
  addOpenedTab: (tab: WorkspaceTab) => void;
  addOpenedTransform: (transform: any) => void;
  setTab: (tab: string) => void;
};

export function useWorkspaceActions({
  workspaceId,
  workspace,
  refetchWorkspaceTables,
  addOpenedTab,
  addOpenedTransform,
  setTab,
}: UseWorkspaceActionsParams) {
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const [mergeWorkspace, { isLoading: isMerging }] =
    useMergeWorkspaceMutation();
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const [runTransform] = useRunWorkspaceTransformMutation();
  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();
  const [runningTransforms, setRunningTransforms] = useState<Set<string>>(
    new Set(),
  );

  const handleMergeWorkspace = useCallback(
    async (commitMessage: string) => {
      try {
        const response = await mergeWorkspace({
          id: workspaceId,
          commit_message: commitMessage,
        }).unwrap();

        if (response.errors && response.errors.length > 0) {
          sendErrorToast(
            t`Failed to merge workspace: ${response.errors.map((e: any) => e.error).join(", ")}`,
          );
          return;
        }
        dispatch(replace(Urls.transformList()));
        sendSuccessToast(
          t`Workspace '${response.workspace.name}' merged successfully`,
        );
      } catch (error) {
        sendErrorToast(t`Failed to merge workspace`);
        throw error;
      }
    },
    [workspaceId, mergeWorkspace, sendErrorToast, dispatch, sendSuccessToast],
  );

  const handleWorkspaceNameChange = useCallback(
    async (newName: string) => {
      if (!workspace || newName.trim() === workspace.name.trim()) {
        return;
      }

      try {
        await updateWorkspace({
          id: workspaceId,
          name: newName.trim(),
        }).unwrap();
        sendSuccessToast(t`Workspace renamed successfully`);
      } catch (error) {
        sendErrorToast(t`Failed to update workspace name`);
      }
    },
    [workspace, workspaceId, updateWorkspace, sendErrorToast, sendSuccessToast],
  );

  const handleTableSelect = useCallback(
    (table: OpenTable) => {
      const tableTab: WorkspaceTab = {
        id: `table-${table.tableId}`,
        name: table.schema ? `${table.schema}.${table.name}` : table.name,
        type: "table",
        table,
      };
      addOpenedTab(tableTab);
      setTab(tableTab.id);
    },
    [addOpenedTab, setTab],
  );

  const handleRunTransformAndShowPreview = useCallback(
    async (transform: WorkspaceTransformItem) => {
      setRunningTransforms((prev) => new Set(prev).add(transform.ref_id));

      try {
        const result = await runTransform({
          workspaceId,
          transformId: transform.ref_id,
        }).unwrap();

        if (result.status === "failed") {
          sendErrorToast(t`Transform run failed`);
          return;
        }

        const { data: updatedTables } = await refetchWorkspaceTables();
        const updatedOutput = updatedTables?.outputs.find(
          (t) => t.isolated.transform_id === transform.ref_id,
        );

        if (updatedOutput?.isolated.table_id) {
          handleTableSelect({
            tableId: updatedOutput.isolated.table_id,
            name: updatedOutput.global.table,
            schema: updatedOutput.global.schema,
            transformId: transform.ref_id,
          });
        }
      } catch (error) {
        sendErrorToast(t`Failed to run transform`);
      } finally {
        setRunningTransforms((prev) => {
          const next = new Set(prev);
          next.delete(transform.ref_id);
          return next;
        });
      }
    },
    [
      workspaceId,
      runTransform,
      refetchWorkspaceTables,
      handleTableSelect,
      sendErrorToast,
    ],
  );

  const handleTransformClick = useCallback(
    async (workspaceTransform: WorkspaceTransformItem) => {
      const { data: transform } = await fetchWorkspaceTransform(
        {
          workspaceId,
          transformId: workspaceTransform.ref_id,
        },
        true,
      );
      if (transform) {
        addOpenedTransform(transform);
      }
    },
    [workspaceId, fetchWorkspaceTransform, addOpenedTransform],
  );

  return {
    isMerging,
    runningTransforms,
    handleMergeWorkspace,
    handleWorkspaceNameChange,
    handleTableSelect,
    handleRunTransformAndShowPreview,
    handleTransformClick,
    sendErrorToast,
  };
}
