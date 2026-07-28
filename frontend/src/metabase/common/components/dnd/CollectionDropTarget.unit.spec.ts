import { createMockCollectionItem } from "metabase-types/api/mocks";

import { canDropItemIntoCollection } from "./CollectionDropTarget";

describe("canDropItemIntoCollection", () => {
  it("should allow dropping an item into another writable collection (metabase#37329)", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: null });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemIntoCollection({ item, collection })).toBe(true);
  });

  it("should not allow dropping an item into a read-only collection", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: null });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: false,
    });

    expect(canDropItemIntoCollection({ item, collection })).toBe(false);
  });

  it("should not allow dropping an item into the collection it is already in", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: 2 });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemIntoCollection({ item, collection })).toBe(false);
  });

  it("should not allow dropping a dragged collection", () => {
    const item = createMockCollectionItem({
      id: 1,
      model: "collection",
      collection_id: null,
    });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });

    expect(canDropItemIntoCollection({ item, collection })).toBe(false);
  });

  it("should not allow dropping into a collection that is part of the dragged selection (metabase#37329)", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: null });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });
    const selectedItems = [
      item,
      createMockCollectionItem({ id: 2, model: "collection" }),
    ];

    expect(canDropItemIntoCollection({ item, collection, selectedItems })).toBe(
      false,
    );
  });

  it("should allow dropping into a collection when the selection does not include it", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: null });
    const collection = createMockCollectionItem({
      id: 2,
      model: "collection",
      can_write: true,
    });
    const selectedItems = [
      item,
      createMockCollectionItem({ id: 2, model: "dashboard" }),
    ];

    expect(canDropItemIntoCollection({ item, collection, selectedItems })).toBe(
      true,
    );
  });

  it("should allow moving an unarchived item to the trash even without write access to it", () => {
    const item = createMockCollectionItem({ id: 1, collection_id: null });
    const trash = createMockCollectionItem({
      id: 2,
      model: "collection",
      type: "trash",
      can_write: false,
    });

    expect(canDropItemIntoCollection({ item, collection: trash })).toBe(true);
  });

  it("should not allow moving an archived item to the trash again", () => {
    const item = createMockCollectionItem({
      id: 1,
      collection_id: null,
      archived: true,
    });
    const trash = createMockCollectionItem({
      id: 2,
      model: "collection",
      type: "trash",
      can_write: true,
    });

    expect(canDropItemIntoCollection({ item, collection: trash })).toBe(false);
  });
});
