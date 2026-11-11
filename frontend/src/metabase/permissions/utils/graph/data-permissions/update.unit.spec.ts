import {
  DataPermission,
  DataPermissionValue,
  type GroupsPermissions,
} from "metabase-types/api";

import { updatePermission } from "./update";

const GROUP_ID = 1;
const DB_ID = 2;

describe("updatePermission", () => {
  it("returns the same graph when the value is unchanged", () => {
    const permissions: GroupsPermissions = {
      [GROUP_ID]: {
        [DB_ID]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
        },
      },
    };

    const result = updatePermission(
      permissions,
      GROUP_ID,
      DB_ID,
      DataPermission.VIEW_DATA,
      [],
      DataPermissionValue.UNRESTRICTED,
    );

    expect(result).toBe(permissions);
  });

  it("replaces a string ancestor with an object when setting a nested value", () => {
    const permissions: GroupsPermissions = {
      [GROUP_ID]: {
        [DB_ID]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    };

    const result = updatePermission(
      permissions,
      GROUP_ID,
      DB_ID,
      DataPermission.CREATE_QUERIES,
      ["public"],
      DataPermissionValue.QUERY_BUILDER,
    );

    expect(result).toEqual({
      [GROUP_ID]: {
        [DB_ID]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: {
            public: DataPermissionValue.QUERY_BUILDER,
          },
        },
      },
    });
    expect(permissions[GROUP_ID][DB_ID][DataPermission.CREATE_QUERIES]).toBe(
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    );
  });

  it("expands to a controlled object seeded with entityIds from the current value", () => {
    const permissions: GroupsPermissions = {
      [GROUP_ID]: {
        [DB_ID]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    };

    const result = updatePermission(
      permissions,
      GROUP_ID,
      DB_ID,
      DataPermission.CREATE_QUERIES,
      [],
      DataPermissionValue.CONTROLLED,
      ["public", "other"],
    );

    expect(result[GROUP_ID][DB_ID][DataPermission.CREATE_QUERIES]).toEqual({
      public: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      other: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    });
  });

  it("keeps an existing object when setting controlled", () => {
    const permissions: GroupsPermissions = {
      [GROUP_ID]: {
        [DB_ID]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: {
            public: { 1: DataPermissionValue.QUERY_BUILDER },
          },
        },
      },
    };

    expect(
      updatePermission(
        permissions,
        GROUP_ID,
        DB_ID,
        DataPermission.CREATE_QUERIES,
        [],
        DataPermissionValue.CONTROLLED,
        ["public"],
      ),
    ).toBe(permissions);
  });
});
