import { merge, setIn } from "icepick";
import _ from "underscore";

import {
  type AppliedDataPermissionUpdate,
  type DataPermissionsDrafts,
  PLUGIN_DATA_PERMISSIONS,
  type PermissionsDatabase,
} from "metabase/plugins";
import type {
  DatabaseId,
  DatabasePermissions,
  GroupsPermissions,
  PermissionsGraph,
} from "metabase-types/api";

import { applyDataPermissionUpdate } from "../../utils/graph-updates";

type DataPermissionEdit = {
  database: PermissionsDatabase;
  original: DatabasePermissions | undefined;
  current: DatabasePermissions | undefined;
};

type DataPermissionEdits = Record<
  string,
  Record<DatabaseId, DataPermissionEdit>
>;

export type DataPermissionsState = {
  edits: DataPermissionEdits;
  revision: number | null;
  drafts: DataPermissionsDrafts;
};

type DataPermissionsAction =
  | {
      type: "permissionUpdated";
      update: AppliedDataPermissionUpdate;
      loadedPermissions: GroupsPermissions;
      revision: number;
    }
  | {
      type: "draftsUpdated";
      updater: (drafts: DataPermissionsDrafts) => DataPermissionsDrafts;
    }
  | { type: "reset" };

export const INITIAL_DATA_PERMISSIONS_STATE: DataPermissionsState = {
  edits: {},
  revision: null,
  drafts: { sandboxes: {}, impersonations: [] },
};

const getEditedPermissions = (
  edits: DataPermissionEdits,
  key: "original" | "current",
): GroupsPermissions =>
  _.mapObject(edits, (databaseEdits) =>
    Object.fromEntries(
      Object.entries(databaseEdits).flatMap(([databaseId, edit]) => {
        const permissions = edit[key];
        return permissions != null ? [[databaseId, permissions]] : [];
      }),
    ),
  );

export const applyDataPermissionEdits = (
  loadedPermissions: GroupsPermissions,
  edits: DataPermissionEdits,
): GroupsPermissions =>
  merge(loadedPermissions, getEditedPermissions(edits, "current"));

export const mergeLoadedGraphs = (graphs: (PermissionsGraph | undefined)[]) =>
  graphs.reduce<GroupsPermissions>(
    (permissions, graph) =>
      graph != null ? merge(permissions, graph.groups) : permissions,
    {},
  );

export const getEditedGraphs = (edits: DataPermissionEdits) => ({
  permissions: getEditedPermissions(edits, "current"),
  originalPermissions: getEditedPermissions(edits, "original"),
  databases: _.uniq(
    Object.values(edits).flatMap((databaseEdits) =>
      Object.values(databaseEdits).map((edit) => edit.database),
    ),
    (database) => database.id,
  ),
});

export function dataPermissionsReducer(
  state: DataPermissionsState,
  action: DataPermissionsAction,
): DataPermissionsState {
  switch (action.type) {
    case "permissionUpdated": {
      const { update, loadedPermissions, revision } = action;
      const { groupId, database } = update;
      const permissions = applyDataPermissionEdits(
        loadedPermissions,
        state.edits,
      );
      const updatedPermissions = applyDataPermissionUpdate(permissions, update);
      const edit: DataPermissionEdit = {
        database,
        original:
          state.edits[groupId]?.[database.id]?.original ??
          loadedPermissions[groupId]?.[database.id],
        current: updatedPermissions[groupId]?.[database.id],
      };
      return {
        edits: setIn(state.edits, [String(groupId), database.id], edit),
        revision: state.revision ?? revision,
        drafts: PLUGIN_DATA_PERMISSIONS.pruneDrafts.reduce(
          (drafts, pruneDrafts) => pruneDrafts(drafts, update),
          state.drafts,
        ),
      };
    }
    case "draftsUpdated":
      return { ...state, drafts: action.updater(state.drafts) };
    case "reset":
      return INITIAL_DATA_PERMISSIONS_STATE;
  }
}

const hasDraftChanges = (drafts: DataPermissionsDrafts) =>
  !_.isEmpty(drafts.sandboxes) || drafts.impersonations.length > 0;

export const getDraftGroupIds = (drafts: DataPermissionsDrafts) =>
  _.uniq([
    ...Object.values(drafts.sandboxes).map(({ group_id }) => String(group_id)),
    ...drafts.impersonations.map(({ group_id }) => String(group_id)),
  ]);

export const getIsDataPermissionsDirty = ({
  edits,
  drafts,
}: Pick<DataPermissionsState, "edits" | "drafts">) =>
  Object.values(edits).some((databaseEdits) =>
    Object.values(databaseEdits).some(
      (edit) => !_.isEqual(edit.original, edit.current),
    ),
  ) || hasDraftChanges(drafts);
