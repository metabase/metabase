import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import type {
  Collection,
  CollectionId,
  CollectionNamespace,
  Group,
  User,
} from "metabase-types/api";

import {
  SHARED_TENANT_NAMESPACE,
  TENANT_SPECIFIC_NAMESPACE,
} from "./constants";
import {
  canPlaceEntityInCollection,
  getNamespaceDisplayName,
  getRootCollectionItem,
  isExternalUser,
  isExternalUsersGroup,
  isTenantCollection,
  isTenantGroup,
} from "./utils";

describe("isExternalUsersGroup", () => {
  it("should return true for all-external-users magic group type", () => {
    const group: Pick<Group, "magic_group_type"> = {
      magic_group_type: "all-external-users",
    };
    expect(isExternalUsersGroup(group)).toBe(true);
  });

  it("should return false for other magic group types", () => {
    const group: Pick<Group, "magic_group_type"> = {
      magic_group_type: "all-internal-users",
    };
    expect(isExternalUsersGroup(group)).toBe(false);
  });

  it("should return false for groups without magic group type", () => {
    const group: Pick<Group, "magic_group_type"> = {
      // @ts-expect-error testing invalid case
      magic_group_type: undefined,
    };
    expect(isExternalUsersGroup(group)).toBe(false);
  });
});

describe("isTenantGroup", () => {
  it("should return true when is_tenant_group is true", () => {
    const group: Pick<Group, "is_tenant_group"> = {
      is_tenant_group: true,
    };
    expect(isTenantGroup(group)).toBe(true);
  });

  it("should return false when is_tenant_group is false", () => {
    const group: Pick<Group, "is_tenant_group"> = {
      is_tenant_group: false,
    };
    expect(isTenantGroup(group)).toBe(false);
  });

  it("should return false when is_tenant_group is undefined", () => {
    const group: Pick<Group, "is_tenant_group"> = {
      is_tenant_group: undefined,
    };
    expect(isTenantGroup(group)).toBe(false);
  });
});

describe("isExternalUser", () => {
  it("should return true when user has a non-null tenant_id", () => {
    const user: Pick<User, "tenant_id"> = {
      tenant_id: 123,
    };
    expect(isExternalUser(user)).toBe(true);
  });

  it("should return false when user has null tenant_id", () => {
    const user: Pick<User, "tenant_id"> = {
      tenant_id: null,
    };
    expect(isExternalUser(user)).toBe(false);
  });

  it("should return false when user is undefined", () => {
    expect(isExternalUser(undefined)).toBe(false);
  });
});

describe("isTenantCollection", () => {
  it("should return true for shared-tenant-collection namespace", () => {
    const collection: Partial<Pick<Collection, "namespace">> = {
      namespace: "shared-tenant-collection",
    };
    expect(isTenantCollection(collection)).toBe(true);
  });

  it("should return false for other namespaces", () => {
    const collection: Partial<Pick<Collection, "namespace">> = {
      namespace: "snippets" as CollectionNamespace,
    };
    expect(isTenantCollection(collection)).toBe(false);
  });

  it("should return false when namespace is undefined", () => {
    const collection: Partial<Pick<Collection, "namespace">> = {};
    expect(isTenantCollection(collection)).toBe(false);
  });
});

describe("canPlaceEntityInCollection (tenants plugin)", () => {
  const createMockCollection = (
    id: CollectionId,
    namespace?: CollectionNamespace,
  ): OmniPickerCollectionItem => ({
    id,
    name: "Test Collection",
    namespace,
    model: "collection",
    location: "/",
    can_write: true,
  });

  const createDbTreeItem = (): OmniPickerItem => ({
    id: 1,
    name: "Test Database",
    model: "database",
  });

  it("should return true when entityType is not provided", () => {
    const collection = createMockCollection("123");
    expect(
      canPlaceEntityInCollection({ collection, entityType: undefined }),
    ).toBe(true);
  });

  it("should return false for items in database tree", () => {
    const collection = createDbTreeItem();
    expect(canPlaceEntityInCollection({ collection, entityType: "card" })).toBe(
      false,
    );
  });

  it("should return true for non-root collections", () => {
    const collection = createMockCollection("123");
    expect(canPlaceEntityInCollection({ collection, entityType: "card" })).toBe(
      true,
    );
  });

  it("should return true for non-tenant namespace collections", () => {
    const collection = createMockCollection("root", "snippets");
    expect(canPlaceEntityInCollection({ collection, entityType: "card" })).toBe(
      true,
    );
  });

  describe("root tenant collections", () => {
    it("should allow collections in shared tenant root", () => {
      const collection = createMockCollection("root", SHARED_TENANT_NAMESPACE);
      expect(
        canPlaceEntityInCollection({ collection, entityType: "collection" }),
      ).toBe(true);
    });

    it("should not allow collections in tenant-specific root", () => {
      const collection = createMockCollection(
        "root",
        TENANT_SPECIFIC_NAMESPACE,
      );
      expect(
        canPlaceEntityInCollection({ collection, entityType: "collection" }),
      ).toBe(false);
    });

    it("should not allow cards in shared tenant root", () => {
      const collection = createMockCollection("root", SHARED_TENANT_NAMESPACE);
      expect(
        canPlaceEntityInCollection({ collection, entityType: "card" }),
      ).toBe(false);
    });

    it("should not allow dashboards in shared tenant root", () => {
      const collection = createMockCollection("root", SHARED_TENANT_NAMESPACE);
      expect(
        canPlaceEntityInCollection({ collection, entityType: "dashboard" }),
      ).toBe(false);
    });

    it("should handle null collection id", () => {
      // @ts-expect-error testing null id case
      const collection = createMockCollection(null, SHARED_TENANT_NAMESPACE);
      expect(
        canPlaceEntityInCollection({ collection, entityType: "card" }),
      ).toBe(false);
    });
  });
});

describe("getNamespaceDisplayName", () => {
  it("should return 'Shared collections' for shared-tenant-collection namespace", () => {
    expect(getNamespaceDisplayName(SHARED_TENANT_NAMESPACE)).toBe(
      "Shared collections",
    );
  });

  it("should return null for tenant-specific namespace", () => {
    expect(getNamespaceDisplayName(TENANT_SPECIFIC_NAMESPACE)).toBe(null);
  });

  it("should return null for other namespaces", () => {
    expect(getNamespaceDisplayName("snippets" as CollectionNamespace)).toBe(
      null,
    );
  });

  it("should return null for undefined namespace", () => {
    expect(getNamespaceDisplayName(undefined)).toBe(null);
  });
});

describe("getRootCollectionItem", () => {
  it("should return correct item for shared tenant namespace", () => {
    const result = getRootCollectionItem({
      namespace: SHARED_TENANT_NAMESPACE,
    });

    expect(result).toEqual({
      id: "root",
      name: "Shared collections",
      namespace: SHARED_TENANT_NAMESPACE,
      here: ["collection"],
      below: ["collection", "card", "dashboard"],
      model: "collection",
      location: "/",
    });
  });

  it("should return correct item for tenant-specific namespace", () => {
    const result = getRootCollectionItem({
      namespace: TENANT_SPECIFIC_NAMESPACE,
    });

    expect(result).toEqual({
      id: "root",
      name: "Tenant collections",
      namespace: TENANT_SPECIFIC_NAMESPACE,
      here: ["collection"],
      below: ["collection", "card", "dashboard"],
      model: "collection",
      can_write: false,
      location: "/",
    });
  });

  it("should return null for other namespaces", () => {
    const result = getRootCollectionItem({
      namespace: "snippets",
    });

    expect(result).toBe(null);
  });
});
