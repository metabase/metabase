import type { RemoteSyncDependencyFailure } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  buildCollectionMap,
  getBlockedCollectionIds,
  getBlockedCollections,
  getBlockedReason,
  getCollectionIdsBlockedByPersonalContent,
  getCollectionPathSegments,
  getRequiredCollectionIds,
  getRequiredCollections,
  isTableChildModel,
  requiresLibrarySync,
} from "./utils";

describe("remote_sync utils", () => {
  describe("buildCollectionMap", () => {
    it("should create a map of collections by id", () => {
      const collection1 = createMockCollection({ id: 1, name: "Collection 1" });
      const collection2 = createMockCollection({ id: 2, name: "Collection 2" });

      const map = buildCollectionMap([collection1, collection2]);

      expect(map.size).toBe(2);
      expect(map.get(1)?.name).toBe("Collection 1");
      expect(map.get(2)?.name).toBe("Collection 2");
    });

    it("should create effective_ancestors for root level collections", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Root Collection",
      });

      const map = buildCollectionMap([collection]);

      const result = map.get(1);
      expect(result?.effective_ancestors).toEqual([]);
    });

    it("should create effective_ancestors for nested collections", () => {
      const parent = createMockCollection({
        id: 1,
        name: "Parent",
      });
      const child = createMockCollection({
        id: 2,
        name: "Child",
      });
      const grandchild = createMockCollection({
        id: 3,
        name: "Grandchild",
      });

      // Build the tree structure
      child.children = [grandchild];
      parent.children = [child];

      const map = buildCollectionMap([parent]);

      // Parent should have empty ancestors
      const parentResult = map.get(1);
      expect(parentResult?.effective_ancestors).toEqual([]);

      // Child should have parent as ancestor
      const childResult = map.get(2);
      expect(childResult?.effective_ancestors).toHaveLength(1);
      expect(childResult?.effective_ancestors?.[0].id).toBe(1);
      expect(childResult?.effective_ancestors?.[0].name).toBe("Parent");

      // Grandchild should have parent and child as ancestors
      const grandchildResult = map.get(3);
      expect(grandchildResult?.effective_ancestors).toHaveLength(2);
      expect(grandchildResult?.effective_ancestors?.[0].id).toBe(1);
      expect(grandchildResult?.effective_ancestors?.[0].name).toBe("Parent");
      expect(grandchildResult?.effective_ancestors?.[1].id).toBe(2);
      expect(grandchildResult?.effective_ancestors?.[1].name).toBe("Child");
    });

    it("should handle multiple root level collections with children", () => {
      const parent1 = createMockCollection({ id: 1, name: "Parent 1" });
      const child1 = createMockCollection({ id: 2, name: "Child 1" });
      parent1.children = [child1];

      const parent2 = createMockCollection({ id: 3, name: "Parent 2" });
      const child2 = createMockCollection({ id: 4, name: "Child 2" });
      parent2.children = [child2];

      const map = buildCollectionMap([parent1, parent2]);

      expect(map.size).toBe(4);

      // Check first tree
      expect(map.get(1)?.effective_ancestors).toEqual([]);
      expect(map.get(2)?.effective_ancestors).toHaveLength(1);
      expect(map.get(2)?.effective_ancestors?.[0].id).toBe(1);

      // Check second tree
      expect(map.get(3)?.effective_ancestors).toEqual([]);
      expect(map.get(4)?.effective_ancestors).toHaveLength(1);
      expect(map.get(4)?.effective_ancestors?.[0].id).toBe(3);
    });

    it("should preserve original collection properties except effective_ancestors", () => {
      const parent = createMockCollection({
        id: 1,
        name: "Parent",
        description: "Parent description",
        archived: false,
      });
      const child = createMockCollection({
        id: 2,
        name: "Child",
        description: "Child description",
        archived: false,
        // Set some existing effective_ancestors that should be overridden
        effective_ancestors: [{ id: 99, name: "Old Ancestor" }],
      });
      parent.children = [child];

      const map = buildCollectionMap([parent]);

      const childResult = map.get(2);
      expect(childResult?.name).toBe("Child");
      expect(childResult?.description).toBe("Child description");
      expect(childResult?.archived).toBe(false);
      // effective_ancestors should be overridden with the actual parent
      expect(childResult?.effective_ancestors).toHaveLength(1);
      expect(childResult?.effective_ancestors?.[0].id).toBe(1);
      expect(childResult?.effective_ancestors?.[0].name).toBe("Parent");
    });
  });

  describe("getCollectionPathSegments", () => {
    it("should return Root for undefined collection id", () => {
      const map = new Map();
      const segments = getCollectionPathSegments(undefined, map);

      expect(segments).toEqual([{ id: "root", name: "Root" }]);
    });

    it("should return Root if collection is not found in map", () => {
      const map = new Map();
      const segments = getCollectionPathSegments(999, map);

      expect(segments).toEqual([{ id: "root", name: "Root" }]);
    });

    it("should return collection path with ancestors", () => {
      const parent = createMockCollection({ id: 1, name: "Parent" });
      const child = createMockCollection({
        id: 2,
        name: "Child",
        effective_ancestors: [{ id: 1, name: "Parent" }],
      });

      const map = new Map([
        [1, parent],
        [2, child],
      ]);

      const segments = getCollectionPathSegments(2, map);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ id: 1, name: "Parent" });
      expect(segments[1]).toEqual({ id: 2, name: "Child" });
    });

    it("should handle collection without ancestors", () => {
      const collection = createMockCollection({
        id: 1,
        name: "Single Collection",
      });

      const map = new Map([[1, collection]]);

      const segments = getCollectionPathSegments(1, map);

      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ id: 1, name: "Single Collection" });
    });

    it("should build path from buildCollectionMap's effective_ancestors", () => {
      const parent = createMockCollection({ id: 1, name: "Parent" });
      const child = createMockCollection({ id: 2, name: "Child" });
      const grandchild = createMockCollection({ id: 3, name: "Grandchild" });

      child.children = [grandchild];
      parent.children = [child];

      // Use buildCollectionMap to create the map with effective_ancestors
      const map = buildCollectionMap([parent]);

      const segments = getCollectionPathSegments(3, map);

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ id: 1, name: "Parent" });
      expect(segments[1]).toEqual({ id: 2, name: "Child" });
      expect(segments[2]).toEqual({ id: 3, name: "Grandchild" });
    });
  });

  describe("isTableChildModel", () => {
    it("should return true for field model", () => {
      expect(isTableChildModel("field")).toBe(true);
    });

    it("should return true for segment model", () => {
      expect(isTableChildModel("segment")).toBe(true);
    });

    it("should return true for measure model", () => {
      expect(isTableChildModel("measure")).toBe(true);
    });

    it("should return false for card model", () => {
      expect(isTableChildModel("card")).toBe(false);
    });

    it("should return false for table model", () => {
      expect(isTableChildModel("table")).toBe(false);
    });

    it("should return false for dashboard model", () => {
      expect(isTableChildModel("dashboard")).toBe(false);
    });
  });

  describe("unsynced dependency failures", () => {
    // Two blocked collections whose dependencies resolve to the same remedy collection, plus a
    // snippet (Library remedy) and a dependency with no actionable remedy.
    const FAILURES: RemoteSyncDependencyFailure[] = [
      {
        collection: { id: 14, name: "Marketing" },
        dependencies: [
          {
            model: "card",
            id: 416,
            name: "Seats over time",
            collection: { id: 7, name: "Finance" },
            remedy: {
              type: "collection",
              collection: { id: 7, name: "Finance", personal: false },
            },
          },
          {
            model: "snippet",
            id: 3,
            name: "active_users",
            remedy: { type: "library" },
          },
        ],
      },
      {
        collection: { id: 22, name: "Ops" },
        dependencies: [
          {
            model: "dashboard",
            id: 91,
            name: "Weekly review",
            collection: { id: 9, name: "Nested" },
            // Same top-level remedy as the card above, reached from a different collection.
            remedy: {
              type: "collection",
              collection: { id: 7, name: "Finance", personal: false },
            },
          },
          {
            model: "card",
            id: 512,
            name: "Orphaned",
            remedy: { type: "none" },
          },
        ],
      },
    ];

    describe("getBlockedCollections", () => {
      it("returns the collections we tried to sync", () => {
        expect(getBlockedCollections(FAILURES)).toEqual([
          { id: 14, name: "Marketing" },
          { id: 22, name: "Ops" },
        ]);
      });

      it("returns nothing when there are no failures", () => {
        expect(getBlockedCollections([])).toEqual([]);
      });
    });

    describe("getBlockedCollectionIds", () => {
      it("reduces the blocked collections to an id set", () => {
        expect(getBlockedCollectionIds(FAILURES)).toEqual(new Set([14, 22]));
      });

      it("is empty when there are no failures", () => {
        expect(getBlockedCollectionIds([]).size).toBe(0);
      });
    });

    describe("getRequiredCollections", () => {
      it("flattens remedies across every failure and dedupes by id", () => {
        expect(getRequiredCollections(FAILURES)).toEqual([
          { id: 7, name: "Finance", personal: false },
        ]);
      });

      it("ignores library and non-actionable remedies", () => {
        const libraryOnly = [
          {
            collection: { id: 14, name: "Marketing" },
            dependencies: [
              {
                model: "snippet" as const,
                id: 3,
                name: "active_users",
                remedy: { type: "library" as const },
              },
            ],
          },
        ];

        expect(getRequiredCollections(libraryOnly)).toEqual([]);
      });

      it("keeps personal collections so callers can flag them as unsyncable", () => {
        const personal = [
          {
            collection: { id: 14, name: "Marketing" },
            dependencies: [
              {
                model: "card" as const,
                id: 1,
                name: "Draft",
                remedy: {
                  type: "collection" as const,
                  collection: { id: 5, name: "Nick's stuff", personal: true },
                },
              },
            ],
          },
        ];

        expect(getRequiredCollections(personal)).toEqual([
          { id: 5, name: "Nick's stuff", personal: true },
        ]);
      });
    });

    describe("getRequiredCollectionIds", () => {
      it("reduces the required collections to a deduped id set", () => {
        expect(getRequiredCollectionIds(FAILURES)).toEqual(new Set([7]));
      });

      it("is empty when no remedy names a collection", () => {
        expect(getRequiredCollectionIds([]).size).toBe(0);
      });
    });

    describe("getCollectionIdsBlockedByPersonalContent", () => {
      it("is empty when no remedy is a personal collection", () => {
        expect(getCollectionIdsBlockedByPersonalContent(FAILURES).size).toBe(0);
      });

      it("flags the blocked collection, not the personal one", () => {
        const failures: RemoteSyncDependencyFailure[] = [
          {
            collection: { id: 14, name: "Marketing" },
            dependencies: [
              {
                model: "card",
                id: 1,
                name: "Draft",
                // Lives in a sub-collection, but the remedy resolves to the personal root.
                collection: { id: 88, name: "Drafts" },
                remedy: {
                  type: "collection",
                  collection: { id: 5, name: "Nick's stuff", personal: true },
                },
              },
            ],
          },
          {
            collection: { id: 22, name: "Ops" },
            dependencies: [
              {
                model: "card",
                id: 2,
                name: "Shared",
                collection: { id: 7, name: "Finance" },
                remedy: {
                  type: "collection",
                  collection: { id: 7, name: "Finance", personal: false },
                },
              },
            ],
          },
        ];

        expect(getCollectionIdsBlockedByPersonalContent(failures)).toEqual(
          new Set([14]),
        );
      });
    });

    describe("requiresLibrarySync", () => {
      it("is true when any dependency asks for the Library", () => {
        expect(requiresLibrarySync(FAILURES)).toBe(true);
      });

      it("is false when no dependency asks for the Library", () => {
        expect(requiresLibrarySync([FAILURES[1]])).toBe(false);
      });
    });

    describe("getBlockedReason", () => {
      const PERSONAL_FAILURE: RemoteSyncDependencyFailure = {
        collection: { id: 31, name: "Drafts" },
        dependencies: [
          {
            model: "card",
            id: 1,
            name: "Draft",
            remedy: {
              type: "collection",
              collection: { id: 5, name: "Personal", personal: true },
            },
          },
        ],
      };

      it("is linked-collections when every remedy is a collection the admin can sync", () => {
        expect(getBlockedReason([FAILURES[1]])).toBe("linked-collections");
      });

      it("is library when a dependency needs the Library and none is personal", () => {
        expect(getBlockedReason(FAILURES)).toBe("library");
      });

      it("outranks the other reasons when any remedy is a personal collection", () => {
        expect(getBlockedReason([...FAILURES, PERSONAL_FAILURE])).toBe(
          "personal-content",
        );
      });
    });
  });
});
