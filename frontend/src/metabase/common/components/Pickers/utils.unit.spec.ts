import { setupEnterpriseTest } from "__support__/enterprise";
import { PLUGIN_TENANTS } from "metabase/plugins";

import {
  getCollectionIdPath,
  getDisabledReasonForSavingModel,
  getNamespaceForItem,
  getStateFromIdPath,
  isNamespaceRoot,
  shouldDisableItemForSavingModel,
} from "./utils";

setupEnterpriseTest();

describe("getCollectionIdPath", () => {
  it("should handle the current user's personal collection", () => {
    const path = getCollectionIdPath(
      {
        id: 1337,
        location: "/",
        effective_location: "/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337]);
  });

  it("should handle the library collections", () => {
    const path = getCollectionIdPath(
      {
        id: 5,
        location: "/6/",
        effective_location: "/6/",
        is_personal: true,
        model: "collection",
        type: "library-metrics",
      },
      1337,
    );

    expect(path).toEqual([6, 5]);
  });

  it("should handle subcollections of the current user's personal collection", () => {
    const path = getCollectionIdPath(
      {
        id: 1339,
        location: "/1337/",
        effective_location: "/1337/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337, 1339]);
  });

  it("should handle all users' personal collections", () => {
    const path = getCollectionIdPath(
      {
        id: "personal",
        location: "/",
        effective_location: "/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["personal"]);
  });

  it("should handle subcollections of all users' personal collections", () => {
    const path = getCollectionIdPath(
      {
        id: 8675309,
        location: "/1400/",
        effective_location: "/1400/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["personal", 1400, 8675309]);
  });

  it("should handle the current user's personal collection within all users' personal collections", () => {
    const path = getCollectionIdPath(
      {
        id: 1337,
        location: "/",
        effective_location: "/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337]);
  });

  it("should handle subcollections of the current user's personal collection within all users' personal collections 🥴", () => {
    const path = getCollectionIdPath(
      {
        id: 1339,
        location: "/1337/",
        effective_location: "/1337/",
        is_personal: true,
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual([1337, 1339]);
  });

  it("should handle root collection", () => {
    const path = getCollectionIdPath(
      {
        id: "root",
        location: "/",
        effective_location: "/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root"]);
  });

  it("should handle subcollections of the root collection", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, 9]);
  });

  it("should use effective location", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, 9]);
  });

  it("should use a negative id when the model is a dashboard", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "dashboard",
      },
      1337,
    );

    expect(path).toEqual(["root", 6, 7, 8, -9]);
  });

  it("should detect tenant collections via namespace", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
        namespace: "shared-tenant-collection" as const,
      },
      1337,
    );

    expect(path).toEqual(["tenant", 6, 7, 8, 9]);
  });

  it("should detect tenant collection items via collection_namespace", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
        collection_namespace: "shared-tenant-collection" as const,
      },
      1337,
    );

    expect(path).toEqual(["tenant", 6, 7, 8, 9]);
  });

  it("should detect tenant collection items - collections (legacy boolean)", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
        is_shared_tenant_collection: true,
      },
      1337,
    );

    expect(path).toEqual(["tenant", 6, 7, 8, 9]);
  });

  it("should detect tenant collection items - dashboards (legacy boolean)", () => {
    const path = getCollectionIdPath(
      {
        id: 9,
        location: "/4/5/6/7/8/",
        effective_location: "/6/7/8/",
        model: "collection",
        is_tenant_dashboard: true,
      },
      1337,
    );

    expect(path).toEqual(["tenant", 6, 7, 8, 9]);
  });

  it("should treat tenant collection root as a root-level item", () => {
    const path = getCollectionIdPath(
      {
        id: 1234,
        location: "/",
        effective_location: "/",
        model: "collection",
        type: "tenant-specific-root-collection",
      },
      1337,
    );

    expect(path).toEqual([1234]);
  });

  it("should nest tenant collection under tenant-specific for admins", () => {
    const rootPath = getCollectionIdPath(
      {
        id: "tenant-specific",
        location: "/",
        model: "collection",
      },
      1337,
    );

    expect(rootPath).toEqual(["tenant-specific"]);

    const childPath = getCollectionIdPath(
      {
        id: 1234,
        location: "/",
        effective_location: "/",
        model: "collection",
        type: "tenant-specific-root-collection",
        collection_id: "tenant-specific",
      },
      1337,
    );

    expect(childPath).toEqual(["tenant-specific", 1234]);
  });
});

describe("getStateFromIdPath", () => {
  it("should propagate namespace through state path", () => {
    const statePath = getStateFromIdPath({
      idPath: ["root", 1, 2],
      namespace: "snippets",
      models: ["collection"],
    });

    // First item has no query
    expect(statePath[0].selectedItem?.namespace).toBe("snippets");

    // Subsequent items should have the namespace in their queries
    expect(statePath[1].query?.namespace).toBe("snippets");
    expect(statePath[2].query?.namespace).toBe("snippets");
  });

  it("should use shared-tenant-collection namespace for tenant paths", () => {
    const statePath = getStateFromIdPath({
      idPath: ["tenant", 1, 2],
      models: ["collection"],
    });

    // Should automatically use shared-tenant-collection namespace
    expect(statePath[0].selectedItem?.namespace).toBe(
      "shared-tenant-collection",
    );
    expect(statePath[1].query?.namespace).toBe("shared-tenant-collection");
    expect(statePath[2].query?.namespace).toBe("shared-tenant-collection");
  });

  it("should propagate namespace to selected items", () => {
    const statePath = getStateFromIdPath({
      idPath: ["tenant", 1],
      models: ["collection"],
    });

    // Selected items should have namespace
    expect(statePath[0].selectedItem?.namespace).toBe(
      "shared-tenant-collection",
    );
    expect(statePath[1].selectedItem?.namespace).toBe(
      "shared-tenant-collection",
    );
  });

  it("should handle root paths without explicit namespace", () => {
    const statePath = getStateFromIdPath({
      idPath: ["root", 1],
      models: ["collection"],
    });

    // Should have undefined namespace for root
    expect(statePath[0].selectedItem?.namespace).toBeUndefined();
    expect(statePath[1].query?.namespace).toBeUndefined();
  });
});

describe("isNamespaceRoot", () => {
  it("should return true for tenant root", () => {
    const item = {
      id: "tenant",
      name: "Shared collections",
      model: "collection" as const,
      namespace: "shared-tenant-collection" as const,
    };

    expect(isNamespaceRoot(item)).toBe(true);
  });

  it("should return false for regular collections", () => {
    const item = {
      id: 1,
      name: "My Collection",
      model: "collection" as const,
      location: "/",
    };

    expect(isNamespaceRoot(item)).toBe(false);
  });

  it("should return false for root collection", () => {
    const item = {
      id: "root",
      name: "Our Analytics",
      model: "collection" as const,
      location: "/",
    };

    expect(isNamespaceRoot(item)).toBe(false);
  });

  it("should return false for tenant sub-collections", () => {
    const item = {
      id: 123,
      name: "Tenant Sub-Collection",
      model: "collection" as const,
      namespace: "shared-tenant-collection" as const,
      location: "/tenant/",
    };

    expect(isNamespaceRoot(item)).toBe(false);
  });
});

describe("shouldDisableItemForSavingModel", () => {
  const tenantRoot = {
    id: "tenant",
    name: "Shared collections",
    model: "collection" as const,
    namespace: "shared-tenant-collection" as const,
  };

  const regularCollection = {
    id: 1,
    name: "My Collection",
    model: "collection" as const,
    location: "/",
  };

  const tenantSubCollection = {
    id: 123,
    name: "Tenant Sub-Collection",
    model: "collection" as const,
    namespace: "shared-tenant-collection" as const,
    location: "/tenant/",
  };

  it("should return true for tenant root when savingModel is not 'collection'", () => {
    expect(shouldDisableItemForSavingModel(tenantRoot, undefined)).toBe(true);
    expect(shouldDisableItemForSavingModel(tenantRoot, null)).toBe(true);
  });

  it("should return false for tenant root when saving a collection", () => {
    expect(shouldDisableItemForSavingModel(tenantRoot, "collection")).toBe(
      false,
    );
  });

  it("should return false for regular collections regardless of savingModel", () => {
    expect(shouldDisableItemForSavingModel(regularCollection, undefined)).toBe(
      false,
    );
    expect(shouldDisableItemForSavingModel(regularCollection, null)).toBe(
      false,
    );
    expect(
      shouldDisableItemForSavingModel(regularCollection, "collection"),
    ).toBe(false);
  });

  it("should return false for tenant sub-collections regardless of savingModel", () => {
    expect(
      shouldDisableItemForSavingModel(tenantSubCollection, undefined),
    ).toBe(false);
    expect(shouldDisableItemForSavingModel(tenantSubCollection, null)).toBe(
      false,
    );
  });
});

describe("getDisabledReasonForSavingModel", () => {
  const tenantRoot = {
    id: "tenant",
    name: "Shared collections",
    model: "collection" as const,
    namespace: "shared-tenant-collection" as const,
  };

  const regularCollection = {
    id: 1,
    name: "My Collection",
    model: "collection" as const,
    location: "/",
  };

  it("should return reason for disabled tenant root when savingModel is not 'collection'", () => {
    const reason = getDisabledReasonForSavingModel(tenantRoot, undefined);

    expect(reason).toBeDefined();
    expect(reason).toContain("tenant root collection");
  });

  it("should return undefined for enabled items", () => {
    expect(
      getDisabledReasonForSavingModel(regularCollection, undefined),
    ).toBeUndefined();
    expect(
      getDisabledReasonForSavingModel(tenantRoot, "collection"),
    ).toBeUndefined();
  });
});

describe("getNamespaceForItem", () => {
  it("should return shared tenant namespace for tenant root", () => {
    const item = {
      id: "tenant",
      namespace: "shared-tenant-collection" as const,
    };

    expect(getNamespaceForItem(item)).toBe(
      PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
    );
  });

  it("should return the item namespace for regular collections with namespace", () => {
    const item = {
      id: 123,
      namespace: "shared-tenant-collection" as const,
    };

    expect(getNamespaceForItem(item)).toBe("shared-tenant-collection");
  });

  it("should return the item namespace for snippet collections", () => {
    const item = {
      id: 456,
      namespace: "snippets" as const,
    };

    expect(getNamespaceForItem(item)).toBe("snippets");
  });

  it("should return undefined for regular collections without namespace", () => {
    const item = {
      id: 789,
      namespace: undefined,
    };

    expect(getNamespaceForItem(item)).toBeUndefined();
  });

  it("should return undefined for null item", () => {
    expect(getNamespaceForItem(null)).toBeUndefined();
  });

  it("should return undefined for undefined item", () => {
    expect(getNamespaceForItem(undefined)).toBeUndefined();
  });

  it("should return undefined for root collection", () => {
    const item = {
      id: "root",
      namespace: undefined,
    };

    expect(getNamespaceForItem(item)).toBeUndefined();
  });
});
