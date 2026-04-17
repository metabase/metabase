import { QueryStatus } from "@reduxjs/toolkit/query";

import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { getCollectionFromCollectionsTree } from "./collection";

const createMockStateWithCollectionsTree = (collections: Collection[]) => {
  return createMockState({
    "metabase-api": {
      queries: {
        "listCollectionsTree(undefined)": {
          status: QueryStatus.fulfilled,
          data: collections,
          error: undefined,
          originalArgs: undefined,
          requestId: "test-request-1",
          endpointName: "listCollectionsTree",
          startedTimeStamp: Date.now(),
          fulfilledTimeStamp: Date.now(),
        },
      },
    },
  } as unknown as Partial<State>);
};

describe("getCollectionFromCollectionsTree", () => {
  it("should return undefined when no collections tree is cached", () => {
    const state = createMockStateWithCollectionsTree([]);
    const result = getCollectionFromCollectionsTree(state, 1);
    expect(result).toBeUndefined();
  });

  it("should return undefined when collection is not found in tree", () => {
    const collections = [
      createMockCollection({ id: 1, name: "Collection 1" }),
      createMockCollection({ id: 2, name: "Collection 2" }),
    ];

    const state = createMockStateWithCollectionsTree(collections);

    const result = getCollectionFromCollectionsTree(state, 999);
    expect(result).toBeUndefined();
  });

  it("should find collection at top level of tree", () => {
    const targetCollection = createMockCollection({ id: 2, name: "Target" });
    const collections = [
      createMockCollection({ id: 1, name: "Collection 1" }),
      targetCollection,
      createMockCollection({ id: 3, name: "Collection 3" }),
    ];

    const state = createMockStateWithCollectionsTree(collections);

    const result = getCollectionFromCollectionsTree(state, 2);
    expect(result).toEqual(targetCollection);
  });

  it("should find collection nested in children", () => {
    const nestedCollection = createMockCollection({
      id: 3,
      name: "Nested Collection",
    });

    const collections: Collection[] = [
      createMockCollection({
        id: 1,
        name: "Parent",
        children: [
          createMockCollection({ id: 2, name: "Child" }),
          nestedCollection,
        ],
      }),
    ];

    const state = createMockStateWithCollectionsTree(collections);

    const result = getCollectionFromCollectionsTree(state, 3);
    expect(result).toEqual(nestedCollection);
  });
});
