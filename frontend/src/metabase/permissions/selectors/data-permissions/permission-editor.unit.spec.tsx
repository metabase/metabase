import type { GroupsPermissions } from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";
import {
  createMockDatabase,
  createMockGroup,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  getDatabasesPermissionEditor,
  getShouldShowTransformPermissions,
} from "./permission-editor";

describe("getShouldShowTransformPermissions", () => {
  describe("OSS version", () => {
    it("should return false for OSS version regardless of other settings", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures(),
          isHosted: false,
          isTransformsEnabled: true,
        }),
      ).toBe(false);
    });
  });

  describe("Pro Self-Hosted", () => {
    it("should return true when transforms feature and setting are both enabled", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures({
            "transforms-basic": true,
          }),
          isHosted: false,
          isTransformsEnabled: true,
        }),
      ).toBe(true);
    });

    it("should return false when transforms feature is enabled but setting is disabled", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures({
            "transforms-basic": true,
          }),
          isHosted: false,
          isTransformsEnabled: false,
        }),
      ).toBe(false);
    });
  });

  describe("Pro Cloud", () => {
    it("should return true when transforms feature is enabled (ignores setting)", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures({
            "transforms-basic": true,
          }),
          isHosted: true,
          isTransformsEnabled: false,
        }),
      ).toBe(true);
    });

    it("should return false when transforms feature is disabled", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures({
            "transforms-basic": false,
          }),
          isHosted: true,
          isTransformsEnabled: false,
        }),
      ).toBe(false);
    });

    it("should return false when transforms feature is disabled even when the setting is enabled", () => {
      expect(
        getShouldShowTransformPermissions({
          tokenFeatures: createMockTokenFeatures({
            "transforms-basic": false,
          }),
          isHosted: true,
          isTransformsEnabled: true,
        }),
      ).toBe(false);
    });
  });
});

const DATABASE = createMockDatabase({
  id: 3,
  name: "Test Database",
  tables: [
    createMockTable({
      id: 10,
      db_id: 3,
      display_name: "People",
      schema: "public",
    }),
  ],
});

describe("getDatabasesPermissionEditor", () => {
  it("does not crash when the selected group has no member count (#74290)", () => {
    const groupWithoutMemberCount = createMockGroup({
      id: 1,
      name: "All Users",
      magic_group_type: "all-internal-users",
    });
    Reflect.deleteProperty(groupWithoutMemberCount, "member_count");

    const permissions: GroupsPermissions = {
      1: {
        3: {
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
        },
      },
    };

    const editor = getDatabasesPermissionEditor({
      params: { groupId: 1, databaseId: 3 },
      databases: [DATABASE],
      database: DATABASE,
      permissions,
      originalPermissions: permissions,
      groups: [groupWithoutMemberCount],
      showTransformPermissions: false,
    });

    expect(editor?.description).toBeNull();
  });
});
