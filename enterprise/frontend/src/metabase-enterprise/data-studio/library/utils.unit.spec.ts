import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker/types";
import { createMockCollectionItem } from "metabase-types/api/mocks";

import { getCollectionPickerItems } from "./utils";

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
