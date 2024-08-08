import _ from "underscore";

import type { GroupsPermissions } from "metabase-types/api";

import { DataPermission, DataPermissionValue } from "../../types";

import {
  getModifiedGroupsPermissionsGraphParts,
  getModifiedCollectionPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "./partial-updates";

describe("getModifiedGroupsPermissionsGraphParts", () => {
  it("should only include groups that have had data permission updated", async () => {
    const simpleUpdate = getModifiedGroupsPermissionsGraphParts(
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
        "2": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
      },
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
        "2": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      ["1", "2"],
      [],
    );

    // should not contain group that had not been modified
    expect(simpleUpdate).not.toHaveProperty("1");
    expect(simpleUpdate).toEqual({
      "2": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
    });
  });

  it("should include groups that have been externally modified", async () => {
    const externalUpdate = getModifiedGroupsPermissionsGraphParts(
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
        "2": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
        "2": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      ["1", "2"],
      ["1"],
    );

    expect(externalUpdate).toEqual({
      "1": {
        "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
      },
    });
  });
});

describe("mergeGroupsPermissionsUpdates", () => {
  // test is a product of bad typings... ideally our state should never be null
  // but our reducers are typed such that it could be null
  it("should take only new permissions if there's not previous state", async () => {
    const update: GroupsPermissions = {
      "1": {
        "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
      },
    };

    expect(mergeGroupsPermissionsUpdates(undefined, update)).toBe(update);
  });

  it("should only apply updates to groups that have been modified", async () => {
    const permissions: GroupsPermissions = {
      "1": {
        "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
      },
      "2": {
        "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
      },
    };

    const update: GroupsPermissions = {
      "2": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
    };

    const expectedResult = {
      "1": {
        "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
      },
      "2": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
    };

    expect(mergeGroupsPermissionsUpdates(permissions, update)).toEqual(
      expectedResult,
    );
  });
});

describe("getModifiedCollectionPermissionsGraphParts", () => {
  it("should only include groups that have had data permission updated", async () => {
    const simpleUpdate = getModifiedCollectionPermissionsGraphParts(
      {
        "1": { "1": "write", "2": "write" },
        "2": { "1": "write", "2": "write" },
        "3": { "1": "write", "2": "write" },
      },
      {
        "1": { "1": "write", "2": "write" },
        "2": { "1": "read", "2": "read" },
        "3": { "1": "write", "2": "write" },
      },
    );

    // should not contain groups that have not been modified
    expect(simpleUpdate).not.toHaveProperty("1");
    expect(simpleUpdate).not.toHaveProperty("3");
    expect(simpleUpdate).toEqual({ "2": { "1": "read", "2": "read" } });
  });
});
