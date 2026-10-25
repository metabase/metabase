import { useCallback, useState } from "react";
import _ from "underscore";

import {
  useGetCollectionPermissionsGraphQuery,
  useUpdateCollectionPermissionsGraphMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type {
  CollectionNamespace,
  CollectionPermissions,
  CollectionPermissionsGraph,
} from "metabase-types/api";

import { getModifiedCollectionPermissionsGraphParts } from "../../utils/graph-updates";

import {
  type UpdateCollectionPermissionParams,
  updateCollectionPermissions,
} from "./utils";

type CollectionPermissionsDraft = {
  savedGraph: CollectionPermissionsGraph;
  permissions: CollectionPermissions;
};

const getDraft = (
  graph: CollectionPermissionsGraph | undefined,
): CollectionPermissionsDraft | null =>
  graph ? { savedGraph: graph, permissions: graph.groups } : null;

export function useCollectionPermissionsGraph(namespace?: CollectionNamespace) {
  const { data: loadedGraph, refetch } = useGetCollectionPermissionsGraphQuery(
    namespace != null ? { namespace } : undefined,
    { refetchOnMountOrArgChange: true },
  );
  const [updateGraph] = useUpdateCollectionPermissionsGraphMutation();
  const [draftGraph, setDraftGraph] = useState(loadedGraph);
  const [draft, setDraft] = useState(() => getDraft(loadedGraph));
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loadedGraph !== draftGraph) {
    setDraftGraph(loadedGraph);
    if (loadedGraph?.revision !== draft?.savedGraph.revision) {
      setDraft(getDraft(loadedGraph));
    }
  }

  const isDirty =
    draft != null && !_.isEqual(draft.permissions, draft.savedGraph.groups);

  const updateCollectionPermission = useCallback(
    (params: UpdateCollectionPermissionParams) => {
      setDraft(
        (draft) =>
          draft && {
            ...draft,
            permissions: updateCollectionPermissions(
              draft.permissions,
              draft.savedGraph.groups,
              params,
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
      namespace,
      revision: draft.savedGraph.revision,
      groups: getModifiedCollectionPermissionsGraphParts(
        draft.savedGraph.groups,
        draft.permissions,
      ),
    });
    if (savedGraph == null) {
      setSaveError(getErrorMessage(error));
      return false;
    }
    setSaveError(null);
    setDraft({
      savedGraph: { ...savedGraph, groups: draft.permissions },
      permissions: draft.permissions,
    });
    return true;
  }, [draft, namespace, updateGraph]);

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
    updateCollectionPermission,
    savePermissions,
    resetPermissions,
    clearSaveError,
  };
}
