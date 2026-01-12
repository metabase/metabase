import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { findCollectionById } from "./collections";

describe("findCollectionById", () => {
  it("should return null when collections array is empty or undefined", () => {
    expect(findCollectionById([], 1)).toBeNull();
    expect(findCollectionById(undefined, 1)).toBeNull();
  });

  it("should return null when collectionId is undefined", () => {
    const collections = [createMockCollection({ id: 1 })];
    expect(findCollectionById(collections, undefined)).toBeNull();
  });

  it("should find collection at top level", () => {
    const targetCollection = createMockCollection({ id: 2, name: "Target" });
    const collections = [
      createMockCollection({ id: 1, name: "First" }),
      targetCollection,
      createMockCollection({ id: 3, name: "Third" }),
    ];

    const result = findCollectionById(collections, 2);
    expect(result).toEqual(targetCollection);
  });

  it("should recursively search nested children collections", () => {
    const deeplyNestedCollection = createMockCollection({
      id: 5,
      name: "Deeply Nested",
    });

    const collections: Collection[] = [
      createMockCollection({
        id: 1,
        name: "Parent 1",
        children: [
          createMockCollection({
            id: 2,
            name: "Child 1-1",
            children: [deeplyNestedCollection],
          }),
          createMockCollection({ id: 3, name: "Child 1-2" }),
        ],
      }),
      createMockCollection({
        id: 4,
        name: "Parent 2",
      }),
    ];

    const result = findCollectionById(collections, 5);
    expect(result).toEqual(deeplyNestedCollection);
  });
});
