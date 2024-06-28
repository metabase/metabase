import _ from "underscore";

import type { GroupsPermissions } from "metabase-types/api";

import { DataPermission, DataPermissionValue } from "../../types";

import {
  getModifiedPermissionsGraphParts,
  mergeGroupsPermissionsUpdates,
} from "./partial-updates";

describe("getModifiedPermissionsGraphParts", () => {
  const simpleUpdate = getModifiedPermissionsGraphParts(
    ["1", "2"],
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
    { modifiedGroupIds: [], permissions: {} },
    2,
  );

  it("should include groups that have had data permission updated", async () => {
    expect(simpleUpdate).toEqual({
      groups: {
        "2": { "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.NO } },
      },
      revision: 2,
    });
  });

  it("should not include groups that have not been altered", async () => {
    expect(simpleUpdate.groups).not.toHaveProperty("1");
  });

  // partially apply arguments for terser testing below
  const advancedGetModifiedPermissionsGraphParts = _.partial(
    getModifiedPermissionsGraphParts,
    ["1", "2"],
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
  );

  it("should include groups that have had an advanced permission added", async () => {
    expect(
      advancedGetModifiedPermissionsGraphParts(
        {
          modifiedGroupIds: ["1"],
          permissions: {
            testAdvancedPermission: [{ group_id: 1 }],
          },
        },
        2,
      ),
    ).toEqual({
      groups: {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      revision: 2,
      testAdvancedPermission: [{ group_id: 1 }],
    });
  });

  it("should include groups that have had an advanced permission updated", async () => {
    expect(
      advancedGetModifiedPermissionsGraphParts(
        {
          modifiedGroupIds: ["1"],
          permissions: {
            testAdvancedPermission: [{ group_id: 1, some_attribute: 1 }],
          },
        },
        2,
      ),
    ).toEqual({
      groups: {
        "1": {
          "1": { [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED },
        },
      },
      revision: 2,
      testAdvancedPermission: [{ group_id: 1, some_attribute: 1 }],
    });
  });

  it("should include groups that have had an advanced permission removed", async () => {
    expect(
      advancedGetModifiedPermissionsGraphParts(
        {
          modifiedGroupIds: ["1"],
          permissions: {
            testAdvancedPermission: [],
          },
        },
        2,
      ),
    ).toEqual({
      groups: {
        "1": {
          "1": {
            [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          },
        },
      },
      revision: 2,
      testAdvancedPermission: [],
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
