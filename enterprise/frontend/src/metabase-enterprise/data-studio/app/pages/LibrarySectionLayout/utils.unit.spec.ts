import { createMockCollection } from "metabase-types/api/mocks";

import { getAccessibleCollection, getWritableCollection } from "./utils";

describe("getWritableCollection", () => {
  it("returns collection when can_write is true", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getWritableCollection(rootCollection, "library-data");

    expect(result).toEqual(childCollection);
  });

  it("returns undefined when can_write is false", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: false,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getWritableCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });

  it("returns undefined when collection type does not exist", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-metrics",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getWritableCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });
});

describe("getAccessibleCollection", () => {
  describe("when instance remote-sync is disabled", () => {
    const isInstanceRemoteSyncEnabled = false;

    it("returns collection when can_write is true", () => {
      const childCollection = createMockCollection({
        id: 2,
        type: "library-data",
        can_write: true,
        is_remote_synced: false,
      });
      const rootCollection = createMockCollection({
        id: 1,
        children: [childCollection],
      });

      const result = getAccessibleCollection(
        rootCollection,
        "library-data",
        isInstanceRemoteSyncEnabled,
      );

      expect(result).toEqual(childCollection);
    });

    it("returns undefined when can_write is false even if collection is remote synced", () => {
      const childCollection = createMockCollection({
        id: 2,
        type: "library-data",
        can_write: false,
        is_remote_synced: true,
      });
      const rootCollection = createMockCollection({
        id: 1,
        children: [childCollection],
      });

      const result = getAccessibleCollection(
        rootCollection,
        "library-data",
        isInstanceRemoteSyncEnabled,
      );

      expect(result).toBeUndefined();
    });
  });

  describe("when instance remote-sync is enabled", () => {
    const isInstanceRemoteSyncEnabled = true;

    it("returns collection when can_write is true (regardless of is_remote_synced)", () => {
      const childCollection = createMockCollection({
        id: 2,
        type: "library-data",
        can_write: true,
        is_remote_synced: false,
      });
      const rootCollection = createMockCollection({
        id: 1,
        children: [childCollection],
      });

      const result = getAccessibleCollection(
        rootCollection,
        "library-data",
        isInstanceRemoteSyncEnabled,
      );

      expect(result).toEqual(childCollection);
    });

    it("returns collection when can_write is false but collection is remote synced", () => {
      const childCollection = createMockCollection({
        id: 2,
        type: "library-data",
        can_write: false,
        is_remote_synced: true,
      });
      const rootCollection = createMockCollection({
        id: 1,
        children: [childCollection],
      });

      const result = getAccessibleCollection(
        rootCollection,
        "library-data",
        isInstanceRemoteSyncEnabled,
      );

      expect(result).toEqual(childCollection);
    });

    it("returns undefined when can_write is false and collection is not remote synced", () => {
      const childCollection = createMockCollection({
        id: 2,
        type: "library-data",
        can_write: false,
        is_remote_synced: false,
      });
      const rootCollection = createMockCollection({
        id: 1,
        children: [childCollection],
      });

      const result = getAccessibleCollection(
        rootCollection,
        "library-data",
        isInstanceRemoteSyncEnabled,
      );

      expect(result).toBeUndefined();
    });
  });

  it("returns undefined when collection type does not exist", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-metrics",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(
      rootCollection,
      "library-data",
      true,
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when root collection has no children", () => {
    const rootCollection = createMockCollection({
      id: 1,
      children: undefined,
    });

    const result = getAccessibleCollection(
      rootCollection,
      "library-data",
      true,
    );

    expect(result).toBeUndefined();
  });
});
