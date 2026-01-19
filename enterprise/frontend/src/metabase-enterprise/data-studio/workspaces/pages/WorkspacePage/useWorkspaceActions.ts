import { useCallback, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTablesQuery,
  useLazyGetWorkspaceTransformQuery,
  useMergeWorkspaceMutation,
  useRunWorkspaceTransformMutation,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type {
  ExternalTransform,
  TaggedTransform,
  Workspace,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import {
  type OpenTable,
  type WorkspaceTab,
  useWorkspace,
} from "./WorkspaceProvider";

type UseWorkspaceActionsParams = {
  workspaceId: number;
  workspace: Workspace | undefined;
  onOpenTab: (tabId: string) => void;
  workspaceTransforms: WorkspaceTransformListItem[];
  availableTransforms: ExternalTransform[];
};

export function useWorkspaceActions({
  workspaceId,
  workspace,
  onOpenTab,
  workspaceTransforms,
  availableTransforms,
}: UseWorkspaceActionsParams) {
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const { addOpenedTab, addOpenedTransform, setActiveTransform } =
    useWorkspace();
  const [mergeWorkspace, { isLoading: isMerging }] =
    useMergeWorkspaceMutation();
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const [runTransform] = useRunWorkspaceTransformMutation();
  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();
  const [fetchTransform] = useLazyGetTransformQuery();
  const [runningTransforms, setRunningTransforms] = useState<Set<string>>(
    new Set(),
  );
  const [getWorkspaceTables] = useLazyGetWorkspaceTablesQuery();

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
      onOpenTab(tableTab.id);
    },
    [addOpenedTab, onOpenTab],
  );

  const handleRunTransformAndShowPreview = useCallback(
    async (transform: WorkspaceTransformListItem) => {
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

        const { data: updatedTables, error } =
          await getWorkspaceTables(workspaceId);
        const updatedOutput = updatedTables?.outputs.find(
          (t) => t.isolated.transform_id === transform.ref_id,
        );

        if (error) {
          sendErrorToast(t`Failed to fetch workspace tables`);
        } else if (updatedOutput?.isolated.table_id) {
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
      getWorkspaceTables,
      handleTableSelect,
      sendErrorToast,
    ],
  );

  const handleTransformClick = useCallback(
    async (workspaceTransform: WorkspaceTransformListItem) => {
      const { data: transform, error } = await fetchWorkspaceTransform(
        {
          workspaceId,
          transformId: workspaceTransform.ref_id,
        },
        true,
      );
      if (error) {
        sendErrorToast(t`Failed to fetch transform`);
      } else if (transform) {
        addOpenedTransform(transform);
      }
    },
    [workspaceId, fetchWorkspaceTransform, addOpenedTransform, sendErrorToast],
  );

  // Callback to navigate to a transform (used by metabot reactions and URL param)
  const handleNavigateToTransform = useCallback(
    async (targetTransformId: number | string) => {
      const transform = [...workspaceTransforms, ...availableTransforms].find(
        (transform) => {
          if ("global_id" in transform) {
            return (
              transform.global_id === targetTransformId ||
              transform.ref_id === targetTransformId
            );
          }
          return transform.id === targetTransformId;
        },
      );

      const isWsTransform = !!transform && "global_id" in transform;

      if (transform && !isWsTransform) {
        const { data, error } = await fetchTransform(transform.id, true);

        if (error) {
          sendErrorToast(t`Failed to fetch transform`);
        } else if (data) {
          const taggedTransform: TaggedTransform = {
            ...data,
            type: "transform",
          };
          addOpenedTransform(taggedTransform);
          setActiveTransform(taggedTransform);
          onOpenTab(String(targetTransformId));
        }
      } else if (transform && isWsTransform) {
        const { data, error } = await fetchWorkspaceTransform({
          workspaceId,
          transformId: transform.ref_id,
        });
        if (error) {
          sendErrorToast(t`Failed to fetch transform`);
        } else if (data) {
          addOpenedTransform(data);
          setActiveTransform(data);
          onOpenTab(String(targetTransformId));
        }
      } else {
        sendErrorToast(`Transform ${targetTransformId} not found`);
      }
    },
    [
      workspaceTransforms,
      availableTransforms,
      workspaceId,
      fetchTransform,
      fetchWorkspaceTransform,
      addOpenedTransform,
      setActiveTransform,
      onOpenTab,
      sendErrorToast,
    ],
  );

  return {
    isMerging,
    runningTransforms,
    handleMergeWorkspace,
    handleWorkspaceNameChange,
    handleTableSelect,
    handleRunTransformAndShowPreview,
    handleTransformClick,
    handleNavigateToTransform,
  };
}
