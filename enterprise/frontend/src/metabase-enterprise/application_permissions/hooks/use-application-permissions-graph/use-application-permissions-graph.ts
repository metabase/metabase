import { assocIn } from "icepick";
import { useCallback, useState } from "react";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils/errors";
import {
  useGetApplicationPermissionsGraphQuery,
  useUpdateApplicationPermissionsGraphMutation,
} from "metabase-enterprise/api";
import type {
  ApplicationPermissionKey,
  ApplicationPermissionValue,
  ApplicationPermissions,
  ApplicationPermissionsGraph,
  GroupId,
} from "metabase-types/api";

type ApplicationPermissionsDraft = {
  savedGraph: ApplicationPermissionsGraph;
  permissions: ApplicationPermissions;
};

type UpdateApplicationPermissionParams = {
  groupId: GroupId;
  permission: ApplicationPermissionKey;
  value: ApplicationPermissionValue;
};

const getDraft = (
  graph: ApplicationPermissionsGraph | undefined,
): ApplicationPermissionsDraft | null =>
  graph ? { savedGraph: graph, permissions: graph.groups } : null;

export function useApplicationPermissionsGraph() {
  const { data: loadedGraph, refetch } = useGetApplicationPermissionsGraphQuery(
    undefined,
    { refetchOnMountOrArgChange: true },
  );
  const [updateGraph] = useUpdateApplicationPermissionsGraphMutation();
  const [draftGraph, setDraftGraph] = useState(loadedGraph);
  const [draft, setDraft] = useState(() => getDraft(loadedGraph));
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loadedGraph !== draftGraph) {
    setDraftGraph(loadedGraph);
    const hasEdits =
      draft != null && !_.isEqual(draft.permissions, draft.savedGraph.groups);
    if (!hasEdits || loadedGraph?.revision !== draft.savedGraph.revision) {
      setDraft(getDraft(loadedGraph));
    }
  }

  const isDirty =
    draft != null && !_.isEqual(draft.permissions, draft.savedGraph.groups);

  const updateApplicationPermission = useCallback(
    ({ groupId, permission, value }: UpdateApplicationPermissionParams) => {
      setDraft(
        (draft) =>
          draft && {
            ...draft,
            permissions: assocIn(
              draft.permissions,
              [groupId, permission],
              value,
            ),
          },
      );
    },
    [],
  );

  const savePermissions = useCallback(async () => {
    if (draft == null) {
      return false;
    }
    const { data: savedGraph, error } = await updateGraph({
      groups: draft.permissions,
      revision: draft.savedGraph.revision,
    });
    if (savedGraph == null) {
      setSaveError(getErrorMessage(error));
      return false;
    }
    setSaveError(null);
    setDraft({ savedGraph, permissions: savedGraph.groups });
    return true;
  }, [draft, updateGraph]);

  const resetPermissions = useCallback(() => {
    setSaveError(null);
    setDraft(
      (draft) => draft && { ...draft, permissions: draft.savedGraph.groups },
    );
    refetch();
  }, [refetch]);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return {
    permissions: draft?.permissions,
    isDirty,
    saveError,
    updateApplicationPermission,
    savePermissions,
    resetPermissions,
    clearSaveError,
  };
}
