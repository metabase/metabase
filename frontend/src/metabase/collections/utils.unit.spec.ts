import {
  canonicalCollectionId,
  canonicalCollectionIdOrEntityId,
  getCollectionPathAsString,
  isExamplesCollection,
  isItemCollection,
  isReadOnlyCollection,
  isRootCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

describe("Collections > utils", () => {
  describe("isRootPersonalCollection", () => {
    it("returns true if personal_owner_id is a number", () => {
      const collection = { personal_owner_id: 1 };

      expect(isRootPersonalCollection(collection)).toBe(true);
    });

    it("returns false if personal_owner_id is not a number", () => {
      const collection = {};

      expect(isRootPersonalCollection(collection)).toBe(false);
    });
  });

  describe("isRootTrashCollection", () => {
    it("returns true if the collection type is 'trash'", () => {
      const collection = createMockCollection({ type: "trash" });
      expect(isRootTrashCollection(collection)).toBe(true);
    });

    it("returns false if the collection type is not 'trash'", () => {
      const collection = createMockCollection({ type: "instance-analytics" });
      expect(isRootTrashCollection(collection)).toBe(false);
    });

    it("returns false if the collection has no type", () => {
      expect(isRootTrashCollection(undefined)).toBe(false);
      expect(isRootTrashCollection({})).toBe(false);
      expect(isRootTrashCollection({ type: null })).toBe(false);
    });
  });

  describe("isExamplesCollection", () => {
    it("returns true if the collection is a sample collection named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: true,
        name: "Examples",
      });
      expect(isExamplesCollection(collection)).toBe(true);
    });

    it("returns false if the collection is a sample but not named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: true,
        name: "Sample Data",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection is named 'Examples' but not a sample", () => {
      const collection = createMockCollection({
        is_sample: false,
        name: "Examples",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection is neither a sample nor named 'Examples'", () => {
      const collection = createMockCollection({
        is_sample: false,
        name: "Regular Collection",
      });
      expect(isExamplesCollection(collection)).toBe(false);
    });

    it("returns false if the collection has no is_sample property", () => {
      expect(
        isExamplesCollection(createMockCollection({ name: "Examples" })),
      ).toBe(false);
    });
  });

  describe("canonicalCollectionId", () => {
    it("returns the id of the collection if it is not a root collection", () => {
      expect(canonicalCollectionId(1337)).toBe(1337);
      expect(canonicalCollectionId(1)).toBe(1);
    });

    it("handles string id inputs", () => {
      expect(canonicalCollectionId("1337")).toBe(1337);
      expect(canonicalCollectionId("1")).toBe(1);
    });

    it('returns null if the collection id is "root"', () => {
      expect(canonicalCollectionId("root")).toBe(null);
    });

    it("returns NaN if the collection id is entity id", () => {
      expect(canonicalCollectionId("HPAvJNTD9XTRkwJZUX9Fz")).toBe(NaN);
    });

    it("returns null if the collection id is null or undefined", () => {
      expect(canonicalCollectionId(null)).toBe(null);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(canonicalCollectionId()).toBe(null);
    });
  });

  describe("canonicalCollectionIdOrEntityId", () => {
    it("returns the id of the collection if it is not a root collection", () => {
      expect(canonicalCollectionIdOrEntityId(1337)).toBe(1337);
      expect(canonicalCollectionIdOrEntityId(1)).toBe(1);
    });

    it("handles string id inputs", () => {
      expect(canonicalCollectionIdOrEntityId("1337")).toBe(1337);
      expect(canonicalCollectionIdOrEntityId("1")).toBe(1);
    });

    it('returns null if the collection id is "root"', () => {
      expect(canonicalCollectionIdOrEntityId("root")).toBe(null);
    });

    it("returns the id of the collection if the collection id is entity id", () => {
      expect(canonicalCollectionIdOrEntityId("HPAvJNTD9XTRkwJZUX9Fz")).toBe(
        "HPAvJNTD9XTRkwJZUX9Fz",
      );
    });

    it("returns null if the collection id is null or undefined", () => {
      expect(canonicalCollectionIdOrEntityId(null)).toBe(null);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(canonicalCollectionIdOrEntityId()).toBe(null);
    });
  });

  describe("isRootCollection", () => {
    it("returns true if the collection is the root collection", () => {
      /* @ts-expect-error the null id should have been coerced to 'root' but lets make sure this still doesn't blow up */
      expect(isRootCollection(createMockCollection({ id: null }))).toBe(true);
      expect(isRootCollection(createMockCollection({ id: "root" }))).toBe(true);
      expect(isRootCollection(createMockCollection({ id: undefined }))).toBe(
        true,
      );
    });

    it("returns true if there is no collection", () => {
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(isRootCollection({})).toBe(true);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(isRootCollection(null)).toBe(true);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(isRootCollection(undefined)).toBe(true);
    });

    it("returns false if the collection is not the root collection", () => {
      expect(isRootCollection(createMockCollection({ id: 1 }))).toBe(false);
      expect(isRootCollection(createMockCollection({ id: "1" }))).toBe(false);
      expect(isRootCollection(createMockCollection({ id: "foobar" }))).toBe(
        false,
      );
    });
  });

  describe("isItemCollection", () => {
    it("returns true if the item is a collection", () => {
      expect(
        isItemCollection(createMockCollectionItem({ model: "collection" })),
      ).toBe(true);
    });

    it("returns false if the item is not a collection", () => {
      expect(
        isItemCollection(createMockCollectionItem({ model: "dashboard" })),
      ).toBe(false);
      expect(
        isItemCollection(createMockCollectionItem({ model: "card" })),
      ).toBe(false);
      expect(
        isItemCollection(createMockCollectionItem({ model: "dataset" })),
      ).toBe(false);
    });
  });

  describe("isReadOnlyCollection", () => {
    it("returns true if the collection is read only", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "collection", can_write: false }),
        ),
      ).toBe(true);
    });

    it("returns false if the collection is not read only", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "collection", can_write: true }),
        ),
      ).toBe(false);
    });

    it("returns false if the item is not a collection", () => {
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "card", can_write: true }),
        ),
      ).toBe(false);
      expect(
        isReadOnlyCollection(
          createMockCollectionItem({ model: "card", can_write: false }),
        ),
      ).toBe(false);
    });
  });

  describe("getCollectionPathAsString", () => {
    it("should return path for collection without ancestors", () => {
      const collection = createMockCollection({
        id: 0,
        name: "Documents",
        effective_ancestors: [],
      });
      const pathString = getCollectionPathAsString(collection);
      expect(pathString).toBe("Documents");
    });

    it("should return path for collection with multiple ancestors", () => {
      const ancestors = [
        createMockCollection({ name: "Home" }),
        createMockCollection({ name: "User" }),
        createMockCollection({ name: "Files" }),
      ];
      const collection = createMockCollection({
        name: "Documents",
        effective_ancestors: ancestors,
      });
      const pathString = getCollectionPathAsString(collection);
      expect(pathString).toBe("Home / User / Files / Documents");
    });
  });
});
