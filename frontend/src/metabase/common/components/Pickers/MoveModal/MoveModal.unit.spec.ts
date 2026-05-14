import { PLUGIN_LIBRARY, reinitialize } from "metabase/plugins";

import type { OmniPickerCollectionItem } from "../EntityPicker";

import {
  canMoveCollectionToLibraryDestination,
  isSameDestination,
} from "./MoveModal";

const makeItem = (
  overrides: Partial<OmniPickerCollectionItem> = {},
): OmniPickerCollectionItem =>
  ({
    id: 1,
    name: "Test Item",
    model: "card" as const,
    ...overrides,
  }) as OmniPickerCollectionItem;

describe("isSameDestination", () => {
  it("should return true when moving to same dashboard", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({ model: "dashboard" as any, id: 10 });
    expect(isSameDestination(movingItem, movingTarget)).toBe(true);
  });

  it("should return true when moving a regular item to its own collection", () => {
    const movingItem = makeItem({
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 7,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(true);
  });

  it("should return false when moving to a different collection", () => {
    const movingItem = makeItem({
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 99,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });

  it("should allow moving a dashboard question to the collection where the dashboard lives", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({
      model: "collection" as any,
      id: 7,
    });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });

  it("should return false when moving to a different dashboard", () => {
    const movingItem = makeItem({
      dashboard_id: 10,
      collection: { id: 7, name: "Collection 1", authority_level: null },
    });
    const movingTarget = makeItem({ model: "dashboard" as any, id: 20 });
    expect(isSameDestination(movingItem, movingTarget)).toBe(false);
  });
});

describe("canMoveCollectionToLibraryDestination", () => {
  beforeEach(() => {
    PLUGIN_LIBRARY.isLibraryCollectionType = (type) => {
      return (
        type === "library" ||
        type === "library-data" ||
        type === "library-metrics"
      );
    };
    PLUGIN_LIBRARY.isLibrarySubCollectionType = (type) => {
      return type === "library-data" || type === "library-metrics";
    };
  });

  afterEach(() => {
    reinitialize();
  });

  it("should not allow moving a non-library collection into Library sections", () => {
    const movingItem = makeItem({ model: "collection", type: null });

    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library" }),
      ),
    ).toBe(false);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-data" }),
      ),
    ).toBe(false);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-metrics" }),
      ),
    ).toBe(false);
  });

  it("should only allow moving library-data collections into Data", () => {
    const movingItem = makeItem({
      model: "collection",
      type: "library-data",
    });

    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library" }),
      ),
    ).toBe(true);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-data" }),
      ),
    ).toBe(true);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-metrics" }),
      ),
    ).toBe(false);
  });

  it("should only allow moving library-metrics collections into Metrics", () => {
    const movingItem = makeItem({
      model: "collection",
      type: "library-metrics",
    });

    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library" }),
      ),
    ).toBe(true);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-data" }),
      ),
    ).toBe(false);
    expect(
      canMoveCollectionToLibraryDestination(
        movingItem,
        makeItem({ model: "collection", type: "library-metrics" }),
      ),
    ).toBe(true);
  });
});
