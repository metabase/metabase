import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useMetadataToasts } from "metabase/common/hooks";
import {
  useGetMcpToolPermissionsQuery,
  useUpdateMcpToolPermissionsMutation,
} from "metabase-enterprise/api";
import type {
  GroupId,
  McpGroupPermission,
  McpTool,
  McpToolPermissionsResponse,
} from "metabase-types/api";

const NO_TOOLS: McpTool[] = [];
const NO_PERMISSIONS: McpGroupPermission[] = [];
const NO_EDITS: Record<GroupId, McpGroupPermission> = {};

type Draft = {
  base: McpToolPermissionsResponse;
  byGroup: Record<GroupId, McpGroupPermission>;
};

type McpToolPermissionsState = {
  tools: McpTool[];
  permissionsByGroup: Record<GroupId, McpGroupPermission>;
  advanced: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  onPermissionChange: (permission: McpGroupPermission) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
};

export function useMcpToolPermissions(): McpToolPermissionsState {
  const { data, isLoading, error } = useGetMcpToolPermissionsQuery();
  const [updateMcpPermissions, { isLoading: isSaving }] =
    useUpdateMcpToolPermissionsMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [draft, setDraft] = useState<Draft | null>(null);

  const saved = data?.permissions ?? NO_PERMISSIONS;
  const edits = draft && draft.base === data ? draft.byGroup : NO_EDITS;

  const changed = useMemo(
    () =>
      Object.values(edits).filter(
        (permission) =>
          !_.isEqual(
            permission,
            saved.find((p) => p.group_id === permission.group_id),
          ),
      ),
    [edits, saved],
  );

  const permissionsByGroup = useMemo(
    () => ({ ..._.indexBy(saved, "group_id"), ...edits }),
    [saved, edits],
  );

  const onPermissionChange = useCallback(
    (permission: McpGroupPermission) => {
      if (!data) {
        return;
      }
      setDraft((prev) => ({
        base: data,
        byGroup: {
          ...(prev && prev.base === data ? prev.byGroup : NO_EDITS),
          [permission.group_id]: permission,
        },
      }));
    },
    [data],
  );

  const onCancel = useCallback(() => setDraft(null), []);

  const onSave = useCallback(async () => {
    try {
      await updateMcpPermissions({ permissions: changed }).unwrap();
      setDraft(null);
    } catch {
      sendErrorToast(t`Failed to save MCP tool permissions`);
    }
  }, [changed, updateMcpPermissions, sendErrorToast]);

  return {
    tools: data?.tools ?? NO_TOOLS,
    permissionsByGroup,
    advanced: data?.advanced ?? false,
    isDirty: changed.length > 0,
    isSaving,
    isLoading,
    error: error ? t`Failed to load MCP tool permissions` : null,
    onPermissionChange,
    onSave,
    onCancel,
  };
}
