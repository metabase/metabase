import { assocIn } from "icepick";

import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { GroupsPermissions } from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

import type { DataRouteParams } from "../../types";

import {
  databases,
  groups,
  initialPermissions,
} from "./data-permissions.unit.spec.fixtures";

import { getGroupsDataPermissionEditor } from ".";

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
