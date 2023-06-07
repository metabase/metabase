import { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

const TEST_COLLECTION = createMockCollection({
  id: 1,
  name: "Writable Collection",
  can_write: true,
});

const TEST_COLLECTION_2 = createMockCollection({
  id: 2,
  name: "One More Writable Collection",
  can_write: true,
});

const TEST_NESTED_COLLECTION_A = createMockCollection({
  id: 5,
  name: "Collection A",
  can_write: true,
  path: [ROOT_COLLECTION.id],
});

const TEST_NESTED_COLLECTION_B = createMockCollection({
  id: 4,
  name: "Collection B",
  can_write: true,
  path: [ROOT_COLLECTION.id],
});

const TEST_NESTED_COLLECTION_C = createMockCollection({
  id: 3,
  name: "Collection C",
  can_write: true,
  path: [ROOT_COLLECTION.id],
});

const DEFAULT_COLLECTIONS = [TEST_COLLECTION, TEST_COLLECTION_2];

const NESTED_COLLECTIONS = [
  TEST_NESTED_COLLECTION_A,
  TEST_NESTED_COLLECTION_B,
  TEST_NESTED_COLLECTION_C,
];

function getReduxState({
  collections = DEFAULT_COLLECTIONS,
}: {
  collections?: Partial<Collection>[];
} = {}) {
  const collectionsById = Object.fromEntries(
    collections.map(collection => [collection.id, collection]),
  );

  return {
    entities: {
      snippetCollections: {
        [ROOT_COLLECTION.id]: ROOT_COLLECTION,
        ...collectionsById,
      },
      snippetCollections_list: {
        null: {
          list: [ROOT_COLLECTION.id, ...collections.map(({ id }) => id)],
        },
      },
    },
  };
}

describe("SnippetCollections selectors", () => {
  describe("getExpandedCollectionsById", () => {
    const { getExpandedCollectionsById } = SnippetCollections.selectors;

    it("preserves snippet collections order", () => {
      const state = getReduxState();
      const expandedCollectionsById = getExpandedCollectionsById(state);
      const expandedCollection = expandedCollectionsById[ROOT_COLLECTION.id];
      const children: Partial<Collection>[] = expandedCollection.children;
      const chilrenIds = children.map(child => child.id);
      const defaultCollectionsIds = DEFAULT_COLLECTIONS.map(({ id }) => id);

      // Only compare ids to avoid comparing circular objects with jest
      expect(chilrenIds).toEqual(defaultCollectionsIds);
    });

    it("preserves nested snippet collections order", () => {
      const nestedCollectionsIds = NESTED_COLLECTIONS.map(({ id }) => id);
      const state = getReduxState({ collections: NESTED_COLLECTIONS });
      const expandedCollectionsById = getExpandedCollectionsById(state);
      const expandedCollection = expandedCollectionsById[ROOT_COLLECTION.id];
      const children: Partial<Collection>[] = expandedCollection.children;
      const chilrenIds = children.map(child => child.id);

      // Only compare ids to avoid comparing circular objects with jest
      expect(chilrenIds).toEqual(nestedCollectionsIds);
    });
  });
});
