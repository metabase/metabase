import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";

import {
  skipToken,
  useGetDatabasePermissionsGraphQuery,
  useGetGroupPermissionsGraphQuery,
  useLazyGetDatabaseMetadataQuery,
  useListPermissionsGroupsQuery,
  useUpdatePermissionsGraphMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { isAdminGroup, isDefaultGroup } from "metabase/common/utils/groups";
import type {
  DataPermissionUpdate,
  DataPermissionView,
  DataPermissionsDrafts,
} from "metabase/plugins";
import type {
  DatabaseId,
  GroupId,
  GroupsPermissions,
} from "metabase-types/api";

import { DATABASE_TABLES_QUERY } from "../../constants/databases";
import type {
  PermissionsGraphDiff,
  UpdateDataPermissionParams,
} from "../../types";
import { diffDataPermissions } from "../../utils/graph-diff";
import { getModifiedGroupsPermissionsGraphParts } from "../../utils/graph-updates";

import {
  INITIAL_DATA_PERMISSIONS_STATE,
  applyDataPermissionEdits,
  dataPermissionsReducer,
  getDraftGroupIds,
  getEditedGraphs,
  getIsDataPermissionsDirty,
  mergeLoadedGraphs,
} from "./reducer";

type DataPermissionsContextValue = {
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  diff: PermissionsGraphDiff;
  drafts: DataPermissionsDrafts;
  isDirty: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: string | undefined;
  hasRevisionChanged: boolean;
  saveError: string | null;
  updateDataPermission: (params: UpdateDataPermissionParams) => Promise<void>;
  updateDrafts: (
    updater: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts,
  ) => void;
  savePermissions: () => Promise<boolean>;
  resetPermissions: () => void;
  clearSaveError: () => void;
};

const DataPermissionsContext =
  createContext<DataPermissionsContextValue | null>(null);

export function useDataPermissions() {
  const context = useContext(DataPermissionsContext);
  if (context == null) {
    throw new Error(
      "useDataPermissions must be used within a DataPermissionsProvider",
    );
  }
  return context;
}

const REFETCH_OPTIONS = { refetchOnMountOrArgChange: true };

type DataPermissionsProviderProps = {
  view?: DataPermissionView;
  groupId?: GroupId;
  databaseId?: DatabaseId;
  children: ReactNode;
};

export function DataPermissionsProvider({
  view,
  groupId,
  databaseId,
  children,
}: DataPermissionsProviderProps) {
  const [state, dispatch] = useReducer(
    dataPermissionsReducer,
    INITIAL_DATA_PERMISSIONS_STATE,
  );

  const { data: groups } = useListPermissionsGroupsQuery({});
  const allUsersGraph = useGetGroupPermissionsGraphQuery(
    groups?.find(isDefaultGroup)?.id ?? skipToken,
    REFETCH_OPTIONS,
  );
  const administratorsGraph = useGetGroupPermissionsGraphQuery(
    groups?.find(isAdminGroup)?.id ?? skipToken,
    REFETCH_OPTIONS,
  );
  const groupGraph = useGetGroupPermissionsGraphQuery(
    view === "group" && groupId != null ? groupId : skipToken,
    REFETCH_OPTIONS,
  );
  const databaseGraph = useGetDatabasePermissionsGraphQuery(
    view === "database" && databaseId != null ? databaseId : skipToken,
    REFETCH_OPTIONS,
  );
  const routeGraph = view === "database" ? databaseGraph : groupGraph;
  const [fetchDatabase] = useLazyGetDatabaseMetadataQuery();
  const [updateGraph, { error: saveErrorPayload, reset: resetSave }] =
    useUpdatePermissionsGraphMutation();

  const allUsersData = allUsersGraph.currentData;
  const administratorsData = administratorsGraph.currentData;
  const routeData = routeGraph.currentData;
  const loadedPermissions = useMemo(
    () => mergeLoadedGraphs([allUsersData, administratorsData, routeData]),
    [allUsersData, administratorsData, routeData],
  );
  const loadedRevision = Math.max(
    0,
    ...[allUsersData, administratorsData, routeData].map(
      (graph) => graph?.revision ?? 0,
    ),
  );

  const applyUpdate = useCallback(
    async (update: DataPermissionUpdate) => {
      const { data: database } = await fetchDatabase(
        { id: update.entityId.databaseId, ...DATABASE_TABLES_QUERY },
        true,
      );
      if (database != null) {
        dispatch({
          type: "permissionUpdated",
          update: { ...update, database },
          loadedPermissions,
          revision: loadedRevision,
        });
      }
    },
    [fetchDatabase, loadedPermissions, loadedRevision],
  );

  const updateDataPermission = useCallback(
    async ({
      groupId,
      permission,
      value,
      entityId,
      view,
    }: UpdateDataPermissionParams) => {
      const postAction = permission.postActions?.[value];
      if (postAction) {
        postAction(entityId, groupId, view, value, applyUpdate);
        return;
      }
      await applyUpdate({
        groupId,
        entityId,
        type: permission.type,
        permission: permission.permission,
        value,
        view,
      });
    },
    [applyUpdate],
  );

  const updateDrafts = useCallback(
    (updater: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts) =>
      dispatch({ type: "draftsUpdated", updater }),
    [],
  );

  const { edits, drafts, revision } = state;
  const editedGraphs = useMemo(() => getEditedGraphs(edits), [edits]);

  const savePermissions = useCallback(async () => {
    const sandboxes = Object.values(drafts.sandboxes);
    const { impersonations } = drafts;
    const { data: savedGraph } = await updateGraph({
      groups: getModifiedGroupsPermissionsGraphParts(
        editedGraphs.permissions,
        editedGraphs.originalPermissions,
        (groups ?? []).map((group) => String(group.id)),
        getDraftGroupIds(drafts),
      ),
      revision: revision ?? loadedRevision,
      ...(sandboxes.length > 0 && { sandboxes }),
      ...(impersonations.length > 0 && { impersonations }),
    });
    if (savedGraph == null) {
      return false;
    }
    dispatch({ type: "reset" });
    return true;
  }, [drafts, editedGraphs, groups, revision, loadedRevision, updateGraph]);

  const resetPermissions = useCallback(() => {
    resetSave();
    dispatch({ type: "reset" });
  }, [resetSave]);

  const permissions = useMemo(
    () => applyDataPermissionEdits(loadedPermissions, edits),
    [loadedPermissions, edits],
  );
  const diff = useMemo(
    () =>
      diffDataPermissions(
        editedGraphs.permissions,
        editedGraphs.originalPermissions,
        groups ?? [],
        editedGraphs.databases,
      ),
    [editedGraphs, groups],
  );
  const isDirty = useMemo(
    () => getIsDataPermissionsDirty({ edits, drafts }),
    [edits, drafts],
  );
  const graphError =
    allUsersGraph.error ?? administratorsGraph.error ?? routeGraph.error;

  const value = useMemo(
    () => ({
      permissions,
      originalPermissions: loadedPermissions,
      diff,
      drafts,
      isDirty,
      isLoading: allUsersGraph.isLoading || administratorsGraph.isLoading,
      isFetching: routeGraph.isFetching,
      error: graphError != null ? getErrorMessage(graphError) : undefined,
      hasRevisionChanged:
        isDirty && revision != null && loadedRevision > revision,
      saveError:
        saveErrorPayload != null ? getErrorMessage(saveErrorPayload) : null,
      updateDataPermission,
      updateDrafts,
      savePermissions,
      resetPermissions,
      clearSaveError: resetSave,
    }),
    [
      permissions,
      loadedPermissions,
      diff,
      drafts,
      isDirty,
      allUsersGraph.isLoading,
      administratorsGraph.isLoading,
      routeGraph.isFetching,
      graphError,
      revision,
      loadedRevision,
      saveErrorPayload,
      updateDataPermission,
      updateDrafts,
      savePermissions,
      resetPermissions,
      resetSave,
    ],
  );

  return (
    <DataPermissionsContext.Provider value={value}>
      {children}
    </DataPermissionsContext.Provider>
  );
}
