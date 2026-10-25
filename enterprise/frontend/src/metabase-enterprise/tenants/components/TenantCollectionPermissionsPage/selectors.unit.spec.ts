import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { CollectionPermissions } from "metabase-types/api";
import {
  createMockCollection,
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  getTenantCollectionEntity,
  getTenantCollectionsPermissionEditor,
  tenantCollectionsQuery,
} from "./selectors";

const ALL_USERS_GROUP = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const ADMIN_GROUP = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});
const EXTERNAL_USERS_GROUP = createMockGroup({
  id: 3,
  name: "All tenant users",
  magic_group_type: "all-external-users",
});
const TENANT_GROUP = createMockGroup({
  id: 4,
  name: "Tenant group",
  magic_group_type: null,
  is_tenant_group: true,
});
const GROUPS = [
  ALL_USERS_GROUP,
  ADMIN_GROUP,
  EXTERNAL_USERS_GROUP,
  TENANT_GROUP,
];

const CHILD_COLLECTION = createMockCollection({ id: 101, name: "Child" });
const PARENT_COLLECTION = createMockCollection({
  id: 100,
  name: "Parent",
  children: [CHILD_COLLECTION],
});

describe("TenantCollectionPermissionsPage selectors", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ tenants: true }),
    });
    setupEnterprisePlugins();
  });

  it("should query shared tenant collections", () => {
    expect(tenantCollectionsQuery).toEqual({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      namespace: "shared-tenant-collection",
    });
  });

  describe("getTenantCollectionEntity", () => {
    it("should return the root collection with the loaded collections as children", () => {
      expect(getTenantCollectionEntity([PARENT_COLLECTION], "root")).toEqual(
        expect.objectContaining({
          id: "root",
          name: "Root shared collection",
          children: [PARENT_COLLECTION],
        }),
      );
    });

    it("should find a nested collection", () => {
      expect(getTenantCollectionEntity([PARENT_COLLECTION], 101)).toBe(
        CHILD_COLLECTION,
      );
    });

    it("should return undefined for a missing collection", () => {
      expect(getTenantCollectionEntity([PARENT_COLLECTION], 999)).toBe(
        undefined,
      );
    });
  });

  describe("getTenantCollectionsPermissionEditor", () => {
    const getPermission = (
      permissions: CollectionPermissions,
      groupId: number,
    ) => {
      const editor = getTenantCollectionsPermissionEditor({
        permissions,
        collection: PARENT_COLLECTION,
        groups: GROUPS,
      });
      return editor.entities.find((entity) => entity.id === groupId)
        ?.permissions?.[0];
    };

    it("should read the group's permission from the graph", () => {
      const permission = getPermission({ 1: { 100: "read" } }, 1);
      expect(permission?.value).toBe("read");
    });

    it("should default a missing permission to none", () => {
      const permission = getPermission({}, 1);
      expect(permission?.value).toBe("none");
    });

    it("should not offer curate access to tenant groups", () => {
      const permission = getPermission({}, TENANT_GROUP.id);
      expect(permission?.options?.map((option) => option.value)).toEqual([
        "read",
        "none",
      ]);
    });

    it("should disable the administrators group", () => {
      expect(getPermission({}, ADMIN_GROUP.id)?.isDisabled).toBe(true);
      expect(getPermission({}, ALL_USERS_GROUP.id)?.isDisabled).toBe(false);
    });

    it("should warn when a sub-collection grants more access", () => {
      const permission = getPermission({ 1: { 100: "none", 101: "read" } }, 1);
      expect(permission?.warning).toBe(
        "This group has permission to view at least one subcollection of this collection.",
      );
    });
  });
});
