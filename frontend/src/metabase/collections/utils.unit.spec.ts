import {
  isRootPersonalCollection,
  canonicalCollectionId,
  isRootCollection,
  isItemCollection,
  isReadOnlyCollection,
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

    it("returns null if the collection id is null or undefined", () => {
      expect(canonicalCollectionId(null)).toBe(null);
      /* @ts-expect-error checking if a race condition not returning expected data behaves as expected */
      expect(canonicalCollectionId()).toBe(null);
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
      /* @ts-expect-error unclear why ids are sometimes strings, but they are */
      expect(isRootCollection(createMockCollection({ id: "1" }))).toBe(false);
      /* @ts-expect-error unclear why ids are sometimes strings, but they are */
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
});
