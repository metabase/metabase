import type {
  RemoteSyncDependencyFailure,
  RemoteSyncIneligibleDependency,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  buildCollectionMap,
  getBlockedReason,
  getCollectionPathSegments,
  getRequiredCollectionRows,
  getRequiredCollections,
  isTableChildModel,
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
            used_by: [],
          },
          {
            model: "snippet",
            id: 3,
            name: "active_users",
            remedy: { type: "library" },
            used_by: [],
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
            used_by: [],
          },
          {
            model: "card",
            id: 512,
            name: "Orphaned",
            remedy: { type: "none" },
            used_by: [],
          },
        ],
      },
    ];

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
                used_by: [],
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
                used_by: [],
              },
            ],
          },
        ];

        expect(getRequiredCollections(personal)).toEqual([
          { id: 5, name: "Nick's stuff", personal: true },
        ]);
      });
    });

    const SYNCABLE_DEPENDENCY: RemoteSyncIneligibleDependency = {
      model: "card",
      id: 1,
      name: "Seats over time",
      remedy: {
        type: "collection",
        collection: { id: 7, name: "Finance", personal: false },
      },
      used_by: [],
    };
    const PERSONAL_DEPENDENCY: RemoteSyncIneligibleDependency = {
      model: "card",
      id: 2,
      name: "Draft",
      remedy: {
        type: "collection",
        collection: { id: 5, name: "Personal", personal: true },
      },
      used_by: [],
    };
    const ROOT_DEPENDENCY: RemoteSyncIneligibleDependency = {
      model: "card",
      id: 3,
      name: "Orphaned",
      collection: null,
      remedy: { type: "none" },
      used_by: [],
    };

    // No remedy, but it does live somewhere — the backend couldn't resolve a syncable ancestor.
    const UNRESOLVED_DEPENDENCY: RemoteSyncIneligibleDependency = {
      model: "card",
      id: 6,
      name: "Stranded",
      collection: { id: 9, name: "Dangling" },
      remedy: { type: "none" },
      used_by: [],
    };
    const SNIPPET_DEPENDENCY: RemoteSyncIneligibleDependency = {
      model: "snippet",
      id: 4,
      name: "active_users",
      remedy: { type: "library" },
      used_by: [],
    };

    const failureWith = (
      ...dependencies: RemoteSyncIneligibleDependency[]
    ): RemoteSyncDependencyFailure[] => [
      { collection: { id: 31, name: "Drafts" }, dependencies },
    ];

    describe("getBlockedReason", () => {
      it("is linked-collections when every remedy is a collection the admin can sync", () => {
        expect(getBlockedReason(failureWith(SYNCABLE_DEPENDENCY))).toBe(
          "linked-collections",
        );
      });

      it("is library when a dependency needs the Library", () => {
        expect(
          getBlockedReason(
            failureWith(SYNCABLE_DEPENDENCY, SNIPPET_DEPENDENCY),
          ),
        ).toBe("library");
      });

      it("ranks root content above the Library, since it can't be synced at all", () => {
        expect(
          getBlockedReason(failureWith(SNIPPET_DEPENDENCY, ROOT_DEPENDENCY)),
        ).toBe("unsyncable-content");
      });

      it("ranks personal content above every other reason", () => {
        expect(
          getBlockedReason(
            failureWith(
              SNIPPET_DEPENDENCY,
              ROOT_DEPENDENCY,
              PERSONAL_DEPENDENCY,
            ),
          ),
        ).toBe("personal-content");
      });
    });

    describe("getRequiredCollectionRows", () => {
      it("marks a syncable remedy as actionable", () => {
        expect(
          getRequiredCollectionRows(failureWith(SYNCABLE_DEPENDENCY)),
        ).toEqual([
          { id: 7, name: "Finance", personal: false, syncable: true },
        ]);
      });

      it("keeps a personal remedy in the list but not as actionable", () => {
        expect(
          getRequiredCollectionRows(failureWith(PERSONAL_DEPENDENCY)),
        ).toEqual([
          { id: 5, name: "Personal", personal: true, syncable: false },
        ]);
      });

      it("names the collection a stranded dependency actually lives in", () => {
        expect(
          getRequiredCollectionRows(failureWith(UNRESOLVED_DEPENDENCY)),
        ).toEqual([
          { id: 9, name: "Dangling", personal: false, syncable: false },
        ]);
      });

      it("adds Our analytics for a root dependency, which carries no remedy of its own", () => {
        expect(getRequiredCollectionRows(failureWith(ROOT_DEPENDENCY))).toEqual(
          [
            {
              id: "root",
              name: "Our analytics",
              personal: false,
              syncable: false,
            },
          ],
        );
      });

      it("lists the syncable remedy alongside Our analytics", () => {
        expect(
          getRequiredCollectionRows(
            failureWith(SYNCABLE_DEPENDENCY, ROOT_DEPENDENCY),
          ),
        ).toEqual([
          { id: 7, name: "Finance", personal: false, syncable: true },
          {
            id: "root",
            name: "Our analytics",
            personal: false,
            syncable: false,
          },
        ]);
      });

      it("is empty when only the Library is implicated", () => {
        expect(
          getRequiredCollectionRows(failureWith(SNIPPET_DEPENDENCY)),
        ).toEqual([]);
      });
    });
  });
});
