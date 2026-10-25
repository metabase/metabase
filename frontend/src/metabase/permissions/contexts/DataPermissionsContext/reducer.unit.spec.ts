import type {
  AppliedDataPermissionUpdate,
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
  dataPermissionsReducer,
  getDraftGroupIds,
  getIsDataPermissionsDirty,
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

const loadGraph = (
  state: DataPermissionsState,
  groups: GroupsPermissions,
  revision = 1,
) =>
  dataPermissionsReducer(state, {
    type: "graphLoaded",
    graph: { groups, revision },
  });

const getLoadedState = () =>
  loadGraph(INITIAL_DATA_PERMISSIONS_STATE, ALL_USERS_PERMISSIONS);

const getCreateQueries = (state: DataPermissionsState) =>
  state.permissions?.[1]?.[1]?.[DataPermission.CREATE_QUERIES];

describe("dataPermissionsReducer", () => {
  it("adds each loaded graph to the permissions and their originals", () => {
    const state = loadGraph(getLoadedState(), ADMIN_PERMISSIONS);

    expect(state.permissions).toEqual({
      ...ALL_USERS_PERMISSIONS,
      ...ADMIN_PERMISSIONS,
    });
    expect(state.originalPermissions).toEqual(state.permissions);
    expect(getIsDataPermissionsDirty(state)).toBe(false);
  });

  it("keeps the edits when a graph for an edited group loads again", () => {
    const editedState = dataPermissionsReducer(getLoadedState(), {
      type: "permissionUpdated",
      update: NO_QUERIES_UPDATE,
    });

    const state = loadGraph(editedState, ALL_USERS_PERMISSIONS);

    expect(getCreateQueries(state)).toBe(DataPermissionValue.NO);
    expect(getIsDataPermissionsDirty(state)).toBe(true);
  });

  it("flags a revision change only after the first load", () => {
    const loadedState = getLoadedState();
    expect(loadedState.hasRevisionChanged).toBe(false);
    expect(
      loadGraph(loadedState, ADMIN_PERMISSIONS, 1).hasRevisionChanged,
    ).toBe(false);
    expect(
      loadGraph(loadedState, ADMIN_PERMISSIONS, 2).hasRevisionChanged,
    ).toBe(true);
  });

  it("ignores a graph older than the current revision", () => {
    const savedState = dataPermissionsReducer(getLoadedState(), {
      type: "saved",
      graph: { groups: ALL_USERS_PERMISSIONS, revision: 2 },
      modifiedGroupIds: ["1"],
    });

    const state = loadGraph(savedState, ADMIN_PERMISSIONS, 1);

    expect(state).toBe(savedState);
    expect(state.hasRevisionChanged).toBe(false);
  });

  it("restores the originals and drops the drafts on reset", () => {
    const editedState = dataPermissionsReducer(
      dataPermissionsReducer(getLoadedState(), {
        type: "permissionUpdated",
        update: NO_QUERIES_UPDATE,
      }),
      {
        type: "draftsUpdated",
        update: (drafts) => ({
          ...drafts,
          sandboxes: { "3:10": POLICY },
        }),
      },
    );

    const state = dataPermissionsReducer(editedState, { type: "reset" });

    expect(state.permissions).toEqual(ALL_USERS_PERMISSIONS);
    expect(state.drafts.sandboxes).toEqual({});
    expect(getIsDataPermissionsDirty(state)).toBe(false);
  });

  it("takes the saved groups and revision after a save", () => {
    const editedState = dataPermissionsReducer(getLoadedState(), {
      type: "permissionUpdated",
      update: NO_QUERIES_UPDATE,
    });
    const savedGroups: GroupsPermissions = {
      1: {
        1: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
        },
      },
    };

    const state = dataPermissionsReducer(editedState, {
      type: "saved",
      graph: { groups: savedGroups, revision: 2 },
      modifiedGroupIds: ["1"],
    });

    expect(state.permissions).toEqual(savedGroups);
    expect(state.originalPermissions).toEqual(savedGroups);
    expect(state.revision).toBe(2);
    expect(getIsDataPermissionsDirty(state)).toBe(false);
  });

  it("keeps the edits and reports the error when a save fails", () => {
    const editedState = dataPermissionsReducer(getLoadedState(), {
      type: "permissionUpdated",
      update: NO_QUERIES_UPDATE,
    });

    const state = dataPermissionsReducer(editedState, {
      type: "saveFailed",
      error: "Revision is stale",
    });

    expect(state.saveError).toBe("Revision is stale");
    expect(getCreateQueries(state)).toBe(DataPermissionValue.NO);
  });

  it("counts drafts as unsaved changes", () => {
    const state = dataPermissionsReducer(getLoadedState(), {
      type: "draftsUpdated",
      update: (drafts) => ({ ...drafts, sandboxes: { "3:10": POLICY } }),
    });

    expect(getIsDataPermissionsDirty(state)).toBe(true);
    expect(getDraftGroupIds(state.drafts)).toEqual(["3"]);
  });
});
