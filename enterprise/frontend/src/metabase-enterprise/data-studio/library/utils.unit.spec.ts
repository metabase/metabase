import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker/types";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import {
  getAccessibleCollection,
  getCollectionPickerItems,
  getLibrarySectionFolders,
} from "./utils";

const libraryParentItem: OmniPickerItem = {
  id: 1,
  name: "Library",
  model: "collection",
  type: "library",
};

describe("getCollectionPickerItems", () => {
  it("should return real Library section roots when available", () => {
    const dataRoot = createMockCollectionItem({
      id: 2,
      name: "Data",
      model: "collection",
      type: "library-data",
      is_library_root: true,
    });
    const metricsRoot = createMockCollectionItem({
      id: 3,
      name: "Metrics",
      model: "collection",
      type: "library-metrics",
      is_library_root: true,
    });

    expect(
      getCollectionPickerItems({
        parentItem: libraryParentItem,
        items: [dataRoot, metricsRoot],
      }),
    ).toEqual([dataRoot, metricsRoot]);
  });

  it("should create synthetic Library section roots for promoted descendants", () => {
    const dataChild = createMockCollectionItem({
      id: 4,
      name: "Data Child",
      model: "collection",
      type: "library-data",
      is_library_root: false,
    });
    const metricsChild = createMockCollectionItem({
      id: 5,
      name: "Metrics Child",
      model: "collection",
      type: "library-metrics",
      is_library_root: false,
    });

    expect(
      getCollectionPickerItems({
        parentItem: libraryParentItem,
        items: [dataChild, metricsChild],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "library-data-1",
        sourceCollectionId: 1,
        name: "Data",
        model: "collection",
        type: "library-data",
        childTypeFilter: "library-data",
      }),
      expect.objectContaining({
        id: "library-metrics-1",
        sourceCollectionId: 1,
        name: "Metrics",
        model: "collection",
        type: "library-metrics",
        childTypeFilter: "library-metrics",
      }),
    ]);
  });

  it("should list the Documents section after the Dashboards section", () => {
    const documentsChild = createMockCollectionItem({
      id: 8,
      name: "Documents Child",
      model: "collection",
      type: "library-documents",
      is_library_root: false,
    });
    const dashboardsRoot = createMockCollectionItem({
      id: 9,
      name: "Dashboards",
      model: "collection",
      type: "library-dashboards",
      is_library_root: true,
    });

    expect(
      getCollectionPickerItems({
        parentItem: libraryParentItem,
        items: [documentsChild, dashboardsRoot],
      }),
    ).toEqual([
      dashboardsRoot,
      expect.objectContaining({
        id: "library-documents-1",
        name: "Documents",
        type: "library-documents",
        childTypeFilter: "library-documents",
      }),
    ]);
  });

  it("should return undefined for non-Library parent items", () => {
    const regularParentItem: OmniPickerItem = {
      id: 6,
      name: "Regular Collection",
      model: "collection",
      type: null,
    };

    expect(
      getCollectionPickerItems({
        parentItem: regularParentItem,
        items: [
          createMockCollectionItem({
            id: 7,
            name: "Child",
            model: "collection",
            type: "library-data",
          }),
        ],
      }),
    ).toBeUndefined();
  });
});

describe("getAccessibleCollection", () => {
  it("returns collection when it exists with can_write true", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toEqual(childCollection);
  });

  it("returns collection when it exists with can_write false", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: false,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toEqual(childCollection);
  });

  it("returns undefined when collection type does not exist", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-metrics",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });

  it("returns undefined when root collection has no children", () => {
    const rootCollection = createMockCollection({
      id: 1,
      children: undefined,
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });
});

describe("getLibrarySectionFolders", () => {
  const LIBRARY = createMockCollection({ id: 1, type: "library" });
  const DASHBOARDS = createMockCollection({
    id: 2,
    type: "library-dashboards",
  });
  const SALES = createMockCollection({ id: 3, type: "library-dashboards" });
  const EMEA = createMockCollection({ id: 4, type: "library-dashboards" });

  it("returns the folders below the section", () => {
    expect(
      getLibrarySectionFolders(
        [LIBRARY, DASHBOARDS, SALES, EMEA],
        "library-dashboards",
      ),
    ).toEqual([SALES, EMEA]);
  });

  it("returns no folders for an item at the section root", () => {
    expect(
      getLibrarySectionFolders([LIBRARY, DASHBOARDS], "library-dashboards"),
    ).toEqual([]);
  });

  it("returns nothing for a path outside the section", () => {
    expect(
      getLibrarySectionFolders(
        [LIBRARY, DASHBOARDS, SALES],
        "library-documents",
      ),
    ).toBeUndefined();
  });
});
