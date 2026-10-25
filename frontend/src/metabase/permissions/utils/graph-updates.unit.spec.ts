import { DataPermission, DataPermissionValue } from "metabase-types/api";

import {
  getModifiedCollectionPermissionsGraphParts,
  getModifiedGroupsPermissionsGraphParts,
} from "./graph-updates";

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

  it("should only include databases with updated data permissions", async () => {
    const update = getModifiedGroupsPermissionsGraphParts(
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO },
          "2": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
          "2": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      ["1"],
      [],
    );

    expect(update).toEqual({
      "1": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
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
