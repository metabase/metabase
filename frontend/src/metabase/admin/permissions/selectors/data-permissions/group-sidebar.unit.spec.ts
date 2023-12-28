import type { State } from "metabase-types/store";
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
    expect(accessPermission.value).toEqual("all");
    expect(accessPermission.options).toEqual([
      {
        icon: "check",
        iconColor: "success",
        label: "Unrestricted",
        value: "all",
      },
      {
        icon: "permissions_limited",
        iconColor: "warning",
        label: "Granular",
        value: "controlled",
      },
      {
        icon: "eye",
        iconColor: "accent5",
        label: "No self-service",
        value: "none",
      },
    ]);

    expect(nativeQueryPermission.value).toEqual("write");
    expect(nativeQueryPermission.options).toEqual([
      {
        icon: "check",
        iconColor: "success",
        label: "Yes",
        value: "write",
      },
      {
        icon: "close",
        iconColor: "danger",
        label: "No",
        value: "none",
      },
    ]);
  });
});
