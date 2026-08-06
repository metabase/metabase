import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { canDropItemsIntoCollection } from "./CollectionDropTarget";

describe("canDropItemsIntoCollection", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupEnterpriseOnlyPlugin("library");
  });

  it("should allow dropping movable items into another writable collection (metabase#37329)", () => {
    const items = [
      createMockCollectionItem({
        id: 1,
        model: "card",
        collection_id: null,
      }),
      createMockCollectionItem({
        id: 2,
        model: "document",
        collection_id: null,
      }),
      createMockCollectionItem({
        id: 3,
        model: "metric",
        collection_id: null,
      }),
    ];
    const collection = createMockCollectionItem({
      id: 4,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(true);
  });

  it("should not allow dropping into a read-only collection", () => {
    const items = [createMockCollectionItem({ id: 1, collection_id: null })];
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: false,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
  });

  it("should not allow dropping when any item is already in the target collection", () => {
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      createMockCollectionItem({ id: 2, collection_id: 3 }),
    ];
    const collection = createMockCollectionItem({
      id: 3,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
  });

  it("should not allow dropping when any dragged item is a collection", () => {
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      createMockCollectionItem({
        id: 2,
        model: "collection",
        collection_id: null,
      }),
    ];
    const collection = createMockCollectionItem({
      id: 3,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
  });

  it("should not allow dropping into a collection in the dragged set (metabase#37329)", () => {
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      collection,
    ];

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
  });

  it("should not allow dropping when any selected item is not movable", () => {
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      createMockCollectionItem({
        id: 2,
        model: "indexed-entity",
        collection_id: null,
      }),
    ];
    const collection = createMockCollectionItem({
      id: 3,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
  });

  it("should require every item to be valid for the collection type", () => {
    const items = [
      createMockCollectionItem({
        id: 1,
        model: "metric",
        collection_id: null,
      }),
      createMockCollectionItem({
        id: 2,
        model: "card",
        collection_id: null,
      }),
    ];
    const collection = createMockCollectionItem({
      id: 3,
      model: "collection",
      type: "library-metrics",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection })).toBe(false);
    expect(canDropItemsIntoCollection({ items: [items[0]], collection })).toBe(
      true,
    );
  });

  it("should allow moving unarchived items to the trash without write access", () => {
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      createMockCollectionItem({
        id: 2,
        model: "document",
        collection_id: null,
      }),
    ];
    const trash = createMockCollectionItem({
      id: 3,
      model: "collection",
      type: "trash",
      can_write: false,
    });

    expect(canDropItemsIntoCollection({ items, collection: trash })).toBe(true);
  });

  it("should not allow moving any already archived item to the trash again", () => {
    const items = [
      createMockCollectionItem({ id: 1, collection_id: null }),
      createMockCollectionItem({
        id: 2,
        collection_id: null,
        archived: true,
      }),
    ];
    const trash = createMockCollectionItem({
      id: 3,
      model: "collection",
      type: "trash",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items, collection: trash })).toBe(
      false,
    );
  });

  it("should not allow an empty drag payload", () => {
    const collection = createMockCollectionItem({
      id: 1,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemsIntoCollection({ items: [], collection })).toBe(false);
  });
});
