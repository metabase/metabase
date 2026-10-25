import { assocIn } from "icepick";

import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { GroupsPermissions } from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";
import {
  createMockDatabase,
  createMockGroup,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { DataRouteParams } from "../types";

import {
  getDatabasesPermissionEditor,
  getGroupsDataPermissionEditor,
  getShouldShowTransformPermissions,
} from "./data-editor";
import {
  databases,
  groups,
  initialPermissions,
} from "./data-editor.unit.spec.fixtures";

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

// adding legacy no self-service in the graph will prevent getGroupsDataPermissionEditor
// from omitting the view data permission options in the case there's only one option
const permissionsWithLegacyValues: GroupsPermissions = assocIn(
  initialPermissions,
  ["1", "3", DataPermission.VIEW_DATA],
  DataPermissionValue.LEGACY_NO_SELF_SERVICE,
);

const getEditor = (
  params: DataRouteParams,
  originalPermissions: GroupsPermissions,
) =>
  getGroupsDataPermissionEditor({
    params,
    database: databases.find(({ id }) => id === params.databaseId),
    permissions: initialPermissions,
    originalPermissions,
    groups: Object.values(groups),
    showTransformPermissions: false,
  });

describe("getGroupsDataPermissionEditor", () => {
  const originalPluginValue =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn;

  beforeEach(() => {
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = true;
  });

  afterEach(() => {
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = originalPluginValue;
  });

  it("returns data for permission editor header", () => {
    const permissionEditorData = getEditor(
      { databaseId: 3 },
      permissionsWithLegacyValues,
    );

    expect(permissionEditorData?.title).toEqual("Permissions for");
    expect(permissionEditorData?.breadcrumbs).toEqual([
      {
        id: 3,
        text: "Imaginary Schemaless Dataset",
        url: "/admin/permissions/data/database/3",
      },
    ]);
    expect(permissionEditorData?.filterPlaceholder).toEqual(
      "Search for a group",
    );
  });

  it("returns entities list for permissions editor", () => {
    const entities = getEditor(
      { databaseId: 3 },
      permissionsWithLegacyValues,
    )?.entities;

    expect(entities).toHaveLength(3);
    expect(entities?.map((entity) => entity.name)).toEqual([
      "All Users",
      "Group starting with full access",
      "Group starting with no access at all",
    ]);

    const [accessPermission, nativeQueryPermission] =
      entities?.[1].permissions ?? [];
    expect(accessPermission.value).toEqual(DataPermissionValue.UNRESTRICTED);
    expect(accessPermission.options).toEqual([
      {
        icon: "eye",
        iconColor: "feedback-positive",
        label: "Can view",
        value: DataPermissionValue.UNRESTRICTED,
      },
      {
        icon: "permissions_limited",
        iconColor: "feedback-warning",
        label: "Granular",
        value: DataPermissionValue.CONTROLLED,
      },
      {
        icon: "eye_crossed_out",
        iconColor: "accent5",
        label: "No self-service (Deprecated)",
        value: DataPermissionValue.LEGACY_NO_SELF_SERVICE,
      },
    ]);

    expect(nativeQueryPermission.value).toEqual(
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    );
    expect(nativeQueryPermission.options).toEqual([
      {
        label: `Query builder and native`,
        value: DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        icon: "check",
        iconColor: "feedback-positive",
      },
      {
        label: `Query builder only`,
        value: DataPermissionValue.QUERY_BUILDER,
        icon: "permissions_limited",
        iconColor: "feedback-warning",
      },
      {
        label: `Granular`,
        value: DataPermissionValue.CONTROLLED,
        icon: "permissions_limited",
        iconColor: "feedback-warning",
      },
      {
        label: `No`,
        value: DataPermissionValue.NO,
        icon: "close",
        iconColor: "feedback-negative",
      },
    ]);
  });

  it("omits view data options when there is only one view data option", () => {
    const entities = getEditor({ databaseId: 3 }, initialPermissions)?.entities;

    const permissions = entities?.[1].permissions ?? [];

    expect(permissions.length).toBe(1);
    expect(permissions[0].type).toBe("native");
  });
});
