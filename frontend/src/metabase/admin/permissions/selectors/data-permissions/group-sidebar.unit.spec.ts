import type { State } from "metabase-types/store";

import { DataPermissionValue } from "../../types";

import { state as mockState } from "./data-permissions.unit.spec.fixtures";

import { getGroupsDataPermissionEditor } from ".";

const state = mockState as unknown as State;

describe("getGroupsDataPermissionEditor", () => {
  it("returns data for permission editor header", () => {
    const permissionEditorData = getGroupsDataPermissionEditor(state, {
      params: {
        databaseId: 3,
      },
    });

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
    const entities = getGroupsDataPermissionEditor(state, {
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
        label: `Granular`,
        value: DataPermissionValue.CONTROLLED,
        icon: "permissions_limited",
        iconColor: "warning",
      },
      {
        label: `Query builder only`,
        value: DataPermissionValue.QUERY_BUILDER,
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
  });
});
