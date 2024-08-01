import { assocIn } from "icepick";

import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type { State } from "metabase-types/store";

import { DataPermission, DataPermissionValue } from "../../types";

import { state as mockState } from "./data-permissions.unit.spec.fixtures";

import { getGroupsDataPermissionEditor } from ".";

const stateWithoutLegacyValues = mockState as unknown as State;

// adding legacy no self-service in the graph will prevent getGroupsDataPermissionEditor
// from omitting the view data permission options in the case there's only one option
const stateWithLegacyValues = assocIn(
  mockState,
  [
    "admin",
    "permissions",
    "originalDataPermissions",
    "1",
    "3",
    DataPermission.VIEW_DATA,
  ],
  DataPermissionValue.LEGACY_NO_SELF_SERVICE,
) as unknown as State;

describe("getGroupsDataPermissionEditor", () => {
  it("returns data for permission editor header", () => {
    const permissionEditorData = getGroupsDataPermissionEditor(
      stateWithLegacyValues,
      {
        params: {
          databaseId: 3,
        },
      },
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
    const originalPluginValue =
      PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn;

    // make sure that we're showing the view data column
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = true;

    const entities = getGroupsDataPermissionEditor(stateWithLegacyValues, {
      params: {
        databaseId: 3,
      },
    })?.entities;

    expect(entities).toHaveLength(3);
    expect(entities?.map(entity => entity.name)).toEqual([
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
        iconColor: "success",
        label: "Can view",
        value: DataPermissionValue.UNRESTRICTED,
      },
      {
        icon: "permissions_limited",
        iconColor: "warning",
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
        iconColor: "success",
      },
      {
        label: `Query builder only`,
        value: DataPermissionValue.QUERY_BUILDER,
        icon: "permissions_limited",
        iconColor: "warning",
      },
      {
        label: `Granular`,
        value: DataPermissionValue.CONTROLLED,
        icon: "permissions_limited",
        iconColor: "warning",
      },
      {
        label: `No`,
        value: DataPermissionValue.NO,
        icon: "close",
        iconColor: "danger",
      },
    ]);

    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = originalPluginValue;
  });

  it("omits view data options when there is only one view data option", () => {
    const entities = getGroupsDataPermissionEditor(stateWithoutLegacyValues, {
      params: {
        databaseId: 3,
      },
    })?.entities;

    const permissions = entities?.[1].permissions ?? [];

    expect(permissions.length).toBe(1);
    expect(permissions[0].type).toBe("native");
  });
});
