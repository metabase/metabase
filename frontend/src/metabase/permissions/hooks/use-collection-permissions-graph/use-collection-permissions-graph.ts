import { useCallback } from "react";

import {
  useGetCollectionPermissionsGraphQuery,
  useUpdateCollectionPermissionsGraphMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type { CollectionNamespace } from "metabase-types/api";

import { getModifiedCollectionPermissionsGraphParts } from "../../utils/graph-updates";
import { usePermissionEdits } from "../use-permission-edits";

import { updateCollectionPermissions } from "./utils";

export function useCollectionPermissionsGraph(namespace?: CollectionNamespace) {
  const { data: graph, isFetching } = useGetCollectionPermissionsGraphQuery(
    namespace != null ? { namespace } : undefined,
    { refetchOnMountOrArgChange: true },
  );
  const [updateGraph, { error, reset }] =
    useUpdateCollectionPermissionsGraphMutation();
  const { permissions, isDirty, addEdit, clearEdits } = usePermissionEdits(
    graph?.groups,
    updateCollectionPermissions,
  );

  const savePermissions = useCallback(async () => {
    if (graph == null || permissions == null) {
      return false;
    }
    const result = await updateGraph({
      namespace,
      revision: graph.revision,
      groups: getModifiedCollectionPermissionsGraphParts(
        graph.groups,
        permissions,
      ),
    });
    if (result.error) {
      return false;
    }
    clearEdits();
    return true;
  }, [graph, permissions, namespace, updateGraph, clearEdits]);

  const resetPermissions = useCallback(() => {
    clearEdits();
    reset();
  }, [clearEdits, reset]);

  return {
    permissions,
    isDirty,
    isFetching,
    saveError: error ? getErrorMessage(error) : null,
    updateCollectionPermission: addEdit,
    savePermissions,
    resetPermissions,
    clearSaveError: reset,
  };
}
