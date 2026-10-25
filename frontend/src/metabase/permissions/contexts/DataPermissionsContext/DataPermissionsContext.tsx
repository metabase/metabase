import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  useLazyGetDatabaseMetadataQuery,
  useListPermissionsGroupsQuery,
  useUpdatePermissionsGraphMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type {
  DataPermissionUpdate,
  DataPermissionsDrafts,
  DatabaseId,
  GroupsPermissions,
  PermissionsDatabase,
  PermissionsGraph,
} from "metabase-types/api";

import { DATABASE_TABLES_QUERY } from "../../constants/databases";
import type { UpdateDataPermissionParams } from "../../types";
import { getModifiedGroupsPermissionsGraphParts } from "../../utils/graph/partial-updates";

import {
  INITIAL_DATA_PERMISSIONS_STATE,
  dataPermissionsReducer,
  getDraftGroupIds,
  getIsDataPermissionsDirty,
} from "./reducer";

type DataPermissionsContextValue = {
  permissions: GroupsPermissions | null;
  originalPermissions: GroupsPermissions | null;
  databasesWithTables: Record<DatabaseId, PermissionsDatabase>;
  drafts: DataPermissionsDrafts;
  isDirty: boolean;
  hasRevisionChanged: boolean;
  saveError: string | null;
  addLoadedGraph: (graph: PermissionsGraph) => void;
  addLoadedDatabase: (database: PermissionsDatabase) => void;
  updateDataPermission: (params: UpdateDataPermissionParams) => Promise<void>;
  updateDrafts: (
    update: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts,
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

type DataPermissionsProviderProps = {
  children: ReactNode;
};

export function DataPermissionsProvider({
  children,
}: DataPermissionsProviderProps) {
  const [state, dispatch] = useReducer(
    dataPermissionsReducer,
    INITIAL_DATA_PERMISSIONS_STATE,
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { data: groups } = useListPermissionsGroupsQuery({});
  const [fetchDatabase] = useLazyGetDatabaseMetadataQuery();
  const [updateGraph] = useUpdatePermissionsGraphMutation();

  const addLoadedGraph = useCallback(
    (graph: PermissionsGraph) => dispatch({ type: "graphLoaded", graph }),
    [],
  );

  const addLoadedDatabase = useCallback(
    (database: PermissionsDatabase) =>
      dispatch({ type: "databaseLoaded", database }),
    [],
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
        });
      }
    },
    [fetchDatabase],
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
    (update: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts) =>
      dispatch({ type: "draftsUpdated", update }),
    [],
  );

  const savePermissions = useCallback(async () => {
    const { permissions, originalPermissions, revision, drafts } =
      stateRef.current;
    if (
      permissions == null ||
      originalPermissions == null ||
      revision == null
    ) {
      return false;
    }

    const modifiedGroups = getModifiedGroupsPermissionsGraphParts(
      permissions,
      originalPermissions,
      (groups ?? []).map((group) => String(group.id)),
      getDraftGroupIds(drafts),
    );
    const sandboxes = Object.values(drafts.sandboxes);
    const { impersonations } = drafts;
    const { data: savedGraph, error } = await updateGraph({
      groups: modifiedGroups,
      revision,
      ...(sandboxes.length > 0 && { sandboxes }),
      ...(impersonations.length > 0 && { impersonations }),
    });

    if (savedGraph != null) {
      dispatch({
        type: "saved",
        graph: savedGraph,
        modifiedGroupIds: Object.keys(modifiedGroups),
      });
      return true;
    }
    dispatch({ type: "saveFailed", error: getErrorMessage(error) });
    return false;
  }, [groups, updateGraph]);

  const resetPermissions = useCallback(() => dispatch({ type: "reset" }), []);

  const clearSaveError = useCallback(
    () => dispatch({ type: "saveErrorCleared" }),
    [],
  );

  const { permissions, originalPermissions, drafts } = state;
  const isDirty = useMemo(
    () =>
      getIsDataPermissionsDirty({ permissions, originalPermissions, drafts }),
    [permissions, originalPermissions, drafts],
  );

  const value = useMemo(
    () => ({
      permissions: state.permissions,
      originalPermissions: state.originalPermissions,
      databasesWithTables: state.databasesWithTables,
      drafts: state.drafts,
      isDirty,
      hasRevisionChanged: state.hasRevisionChanged,
      saveError: state.saveError,
      addLoadedGraph,
      addLoadedDatabase,
      updateDataPermission,
      updateDrafts,
      savePermissions,
      resetPermissions,
      clearSaveError,
    }),
    [
      state,
      isDirty,
      addLoadedGraph,
      addLoadedDatabase,
      updateDataPermission,
      updateDrafts,
      savePermissions,
      resetPermissions,
      clearSaveError,
    ],
  );

  return (
    <DataPermissionsContext.Provider value={value}>
      {children}
    </DataPermissionsContext.Provider>
  );
}
