import { assocIn } from "icepick";
import { useCallback } from "react";

import { getErrorMessage } from "metabase/api/utils/errors";
import { usePermissionEdits } from "metabase/permissions";
import {
  useGetApplicationPermissionsGraphQuery,
  useUpdateApplicationPermissionsGraphMutation,
} from "metabase-enterprise/api";
import type {
  ApplicationPermissionKey,
  ApplicationPermissionValue,
  ApplicationPermissions,
  GroupId,
} from "metabase-types/api";

type UpdateApplicationPermissionParams = {
  groupId: GroupId;
  permission: ApplicationPermissionKey;
  value: ApplicationPermissionValue;
};

const updateApplicationPermissions = (
  permissions: ApplicationPermissions,
  _savedPermissions: ApplicationPermissions,
  { groupId, permission, value }: UpdateApplicationPermissionParams,
): ApplicationPermissions => assocIn(permissions, [groupId, permission], value);

export function useApplicationPermissionsGraph() {
  const { data: graph, isFetching } = useGetApplicationPermissionsGraphQuery(
    undefined,
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const [updateGraph, { error, reset }] =
    useUpdateApplicationPermissionsGraphMutation();
  const { permissions, isDirty, addEdit, clearEdits } = usePermissionEdits(
    graph?.groups,
    updateApplicationPermissions,
  );

  const savePermissions = useCallback(async () => {
    if (graph == null || permissions == null) {
      return;
    }
    const result = await updateGraph({
      groups: permissions,
      revision: graph.revision,
    });
    if (!result.error) {
      clearEdits();
    }
  }, [graph, permissions, updateGraph, clearEdits]);

  const resetPermissions = useCallback(() => {
    clearEdits();
    reset();
  }, [clearEdits, reset]);

  return {
    permissions,
    isDirty,
    isFetching,
    saveError: error ? getErrorMessage(error) : null,
    updateApplicationPermission: addEdit,
    savePermissions,
    resetPermissions,
    clearSaveError: reset,
  };
}
