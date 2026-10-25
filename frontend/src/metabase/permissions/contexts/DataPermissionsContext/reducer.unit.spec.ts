import type { AppliedDataPermissionUpdate } from "metabase/plugins";
import type {
  GroupTableAccessPolicy,
  GroupsPermissions,
} from "metabase-types/api";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import {
  type DataPermissionsState,
  INITIAL_DATA_PERMISSIONS_STATE,
  applyDataPermissionEdits,
  dataPermissionsReducer,
  getDraftGroupIds,
  getEditedGraphs,
  getIsDataPermissionsDirty,
  mergeLoadedGraphs,
} from "./reducer";

const DATABASE = createMockDatabase({
  id: 1,
  tables: [createMockTable({ id: 10, db_id: 1, schema: "public" })],
});

const ALL_USERS_PERMISSIONS: GroupsPermissions = {
  1: {
    1: {
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
      [DataPermission.CREATE_QUERIES]: DataPermissionValue.QUERY_BUILDER,
    },
  },
};

const ADMIN_PERMISSIONS: GroupsPermissions = {
  2: {
    1: {
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
      [DataPermission.CREATE_QUERIES]:
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    },
  },
};

const POLICY: GroupTableAccessPolicy = {
  id: 1,
  group_id: 3,
  table_id: 10,
  card_id: null,
  attribute_remappings: {},
  permission_id: null,
};

const NO_QUERIES_UPDATE: AppliedDataPermissionUpdate = {
  groupId: 1,
  entityId: { databaseId: 1 },
  type: DataPermissionType.NATIVE,
  permission: DataPermission.CREATE_QUERIES,
  value: DataPermissionValue.NO,
  view: "group",
  database: DATABASE,
};

const LOADED_PERMISSIONS = mergeLoadedGraphs([
  { groups: ALL_USERS_PERMISSIONS, revision: 1 },
  { groups: ADMIN_PERMISSIONS, revision: 1 },
]);

const editQueries = (
  state: DataPermissionsState,
  loadedPermissions = LOADED_PERMISSIONS,
  revision = 1,
) =>
  dataPermissionsReducer(state, {
    type: "permissionUpdated",
    update: NO_QUERIES_UPDATE,
    loadedPermissions,
    revision,
  });

const getCreateQueries = (permissions: GroupsPermissions) =>
  permissions[1]?.[1]?.[DataPermission.CREATE_QUERIES];

describe("dataPermissionsReducer", () => {
  it("merges the loaded graphs", () => {
    expect(LOADED_PERMISSIONS).toEqual({
      ...ALL_USERS_PERMISSIONS,
      ...ADMIN_PERMISSIONS,
    });
    expect(getIsDataPermissionsDirty(INITIAL_DATA_PERMISSIONS_STATE)).toBe(
      false,
    );
  });

  it("keeps an edit on top of a graph that loads again", () => {
    const state = editQueries(INITIAL_DATA_PERMISSIONS_STATE);

    expect(
      getCreateQueries(
        applyDataPermissionEdits(LOADED_PERMISSIONS, state.edits),
      ),
    ).toBe(DataPermissionValue.NO);
    expect(getCreateQueries(applyDataPermissionEdits({}, state.edits))).toBe(
      DataPermissionValue.NO,
    );
    expect(getIsDataPermissionsDirty(state)).toBe(true);
  });

  it("keeps the first original and revision across edits", () => {
    const state = editQueries(
      editQueries(INITIAL_DATA_PERMISSIONS_STATE),
      {},
      2,
    );
    const { originalPermissions, databases } = getEditedGraphs(state.edits);

    expect(getCreateQueries(originalPermissions)).toBe(
      DataPermissionValue.QUERY_BUILDER,
    );
    expect(databases).toEqual([DATABASE]);
    expect(state.revision).toBe(1);
  });

  it("drops the edits and the drafts on reset", () => {
    const editedState = dataPermissionsReducer(
      editQueries(INITIAL_DATA_PERMISSIONS_STATE),
      {
        type: "draftsUpdated",
        updater: (drafts) => ({
          ...drafts,
          sandboxes: { "3:10": POLICY },
        }),
      },
    );

    const state = dataPermissionsReducer(editedState, { type: "reset" });

    expect(state).toBe(INITIAL_DATA_PERMISSIONS_STATE);
    expect(getIsDataPermissionsDirty(state)).toBe(false);
  });

  it("counts drafts as unsaved changes", () => {
    const state = dataPermissionsReducer(INITIAL_DATA_PERMISSIONS_STATE, {
      type: "draftsUpdated",
      updater: (drafts) => ({ ...drafts, sandboxes: { "3:10": POLICY } }),
    });

    expect(getIsDataPermissionsDirty(state)).toBe(true);
    expect(getDraftGroupIds(state.drafts)).toEqual(["3"]);
  });
});
