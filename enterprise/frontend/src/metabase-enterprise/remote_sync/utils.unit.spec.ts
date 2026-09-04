import type {
  RemoteSyncDependencyRemedy,
  RemoteSyncIneligibleDependency,
  RemoteSyncRequiredSync,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  buildCollectionMap,
  getBlockedReason,
  getCollectionPathSegments,
  getListedRequiredSyncs,
  getRequiredSyncRow,
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
    const dependency = (
      overrides: Partial<RemoteSyncIneligibleDependency> = {},
    ): RemoteSyncIneligibleDependency => ({
      model: "card",
      id: 1,
      name: "Seats over time",
      used_by: [],
      ...overrides,
    });

    const requiredSync = (
      remedy: RemoteSyncDependencyRemedy,
      syncable = false,
    ): RemoteSyncRequiredSync => ({
      remedy,
      syncable,
      blocks: [{ id: 31, name: "Drafts" }],
      dependencies: [dependency()],
    });

    const SYNCABLE = requiredSync(
      {
        type: "collection",
        collection: { id: 7, name: "Finance", type: null, personal: false },
      },
      true,
    );
    const PERSONAL = requiredSync({
      type: "collection",
      collection: { id: 5, name: "Personal", type: null, personal: true },
    });
    const LIBRARY_COLLECTION = requiredSync(
      {
        type: "collection",
        collection: {
          id: 2,
          name: "Library",
          type: "library",
          personal: false,
        },
      },
      true,
    );
    // No Library exists at all, so the remedy names nothing.
    const LIBRARY_MISSING = requiredSync({ type: "library" });
    const ROOT = requiredSync({ type: "none", collection: null });
    const NAMED_NONE = requiredSync({
      type: "none",
      collection: { id: 9, name: "Dangling" },
    });
    const UNRESOLVED = requiredSync({ type: "none" });

    describe("getBlockedReason", () => {
      it("is linked-collections when every remedy is a collection the admin can sync", () => {
        expect(getBlockedReason([SYNCABLE])).toBe("linked-collections");
      });

      it("is library-missing when a snippet has no Library to point at", () => {
        expect(getBlockedReason([SYNCABLE, LIBRARY_MISSING])).toBe(
          "library-missing",
        );
      });

      // Once a Library exists the snippet carries an ordinary collection remedy, like anything else.
      it("is linked-collections when a snippet points at an existing Library", () => {
        expect(getBlockedReason([SYNCABLE, LIBRARY_COLLECTION])).toBe(
          "linked-collections",
        );
      });

      it("ranks root content above a missing Library, since it can't be synced at all", () => {
        expect(getBlockedReason([LIBRARY_MISSING, ROOT])).toBe(
          "unsyncable-content",
        );
      });

      it("ranks personal content above every other reason", () => {
        expect(getBlockedReason([LIBRARY_MISSING, ROOT, PERSONAL])).toBe(
          "personal-content",
        );
      });
    });

    describe("getListedRequiredSyncs", () => {
      it("lists every entry that names a collection", () => {
        expect(getListedRequiredSyncs([SYNCABLE, PERSONAL])).toEqual([
          PERSONAL,
          SYNCABLE,
        ]);
      });

      // They need content moved, so they outrank anything the admin could just switch on.
      it("brings what can't be synced to the top", () => {
        expect(
          getListedRequiredSyncs([
            SYNCABLE,
            ROOT,
            LIBRARY_COLLECTION,
            PERSONAL,
          ]),
        ).toEqual([ROOT, PERSONAL, SYNCABLE, LIBRARY_COLLECTION]);
      });

      it("keeps the backend's order within each group", () => {
        expect(getListedRequiredSyncs([LIBRARY_COLLECTION, SYNCABLE])).toEqual([
          LIBRARY_COLLECTION,
          SYNCABLE,
        ]);
      });

      // The message says to create it; there is no row to draw.
      it("drops an entry for a Library that doesn't exist", () => {
        expect(getListedRequiredSyncs([SYNCABLE, LIBRARY_MISSING])).toEqual([
          SYNCABLE,
        ]);
      });
    });

    describe("getRequiredSyncRow", () => {
      it("offers a syncable collection, keeping the type its icon needs", () => {
        expect(getRequiredSyncRow(LIBRARY_COLLECTION)).toEqual({
          key: "collection:2",
          name: "Library",
          type: "library",
          personal: false,
          syncableId: 2,
          collectionId: 2,
        });
      });

      it("names a personal collection but offers nothing to switch on", () => {
        expect(getRequiredSyncRow(PERSONAL)).toEqual({
          key: "collection:5",
          name: "Personal",
          type: null,
          personal: true,
          syncableId: null,
          collectionId: 5,
        });
      });

      it("calls the root collection Our analytics", () => {
        expect(getRequiredSyncRow(ROOT)).toMatchObject({
          key: "root",
          name: "Our analytics",
          syncableId: null,
          collectionId: "root",
        });
      });

      it("names the collection unsyncable content actually lives in", () => {
        expect(getRequiredSyncRow(NAMED_NONE)).toMatchObject({
          key: "none:9",
          name: "Dangling",
          syncableId: null,
          collectionId: 9,
        });
      });

      // Reported rather than dropped, but there is nothing to name and nowhere to link.
      it("still shows a collection the backend couldn't resolve", () => {
        expect(getRequiredSyncRow(UNRESOLVED)).toMatchObject({
          key: "unresolved",
          name: "Unknown collection",
          syncableId: null,
          collectionId: null,
        });
      });
    });
  });
});
