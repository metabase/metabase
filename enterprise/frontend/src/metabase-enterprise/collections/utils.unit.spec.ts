import { createMockCollection } from "metabase-types/api/mocks";

import { getCollectionType, isRegularCollection, getIcon } from "./utils";

describe("Collections plugin utils", () => {
  const COLLECTION = {
    NO_AUTHORITY_LEVEL: createMockCollection({
      id: "root",
      name: "Our analytics",
    }),
    REGULAR: createMockCollection({ authority_level: null }),
    OFFICIAL: createMockCollection({ authority_level: "official" }),
  };

  describe("isRegularCollection", () => {
    it("returns 'true' if collection is missing an authority level", () => {
      const collection = COLLECTION.NO_AUTHORITY_LEVEL;
      expect(isRegularCollection(collection)).toBe(true);
    });

    it("returns 'true' for regular collections", () => {
      const collection = COLLECTION.REGULAR;
      expect(isRegularCollection(collection)).toBe(true);
    });

    it("returns 'false' for official collections", () => {
      const collection = COLLECTION.OFFICIAL;
      expect(isRegularCollection(collection)).toBe(false);
    });
  });

  describe("getCollectionType", () => {
    it("regular collection", () => {
      const collection = createMockCollection();
      expect(getCollectionType(collection).icon).toBe("folder");
    });

    it("official collection", () => {
      const collection = createMockCollection({ authority_level: "official" });
      expect(getCollectionType(collection).icon).toBe("badge");
    });

    it("instance analytics collection", () => {
      const collection = createMockCollection({ type: "instance-analytics" });
      expect(getCollectionType(collection).icon).toBe("audit");
    });

    it("root collection", () => {
      const collection = createMockCollection();
      expect(getCollectionType(collection).type).toBe(null);
      expect(getCollectionType({}).type).toBe(null);
    });
  });

  describe("getIcon", () => {
    it("should return the default icon for a regular collection", () => {
      expect(getIcon({ model: "collection" })).toEqual({ name: "folder" });
    });
    it("should return the default icon for a regular dashboard", () => {
      expect(getIcon({ model: "dashboard" })).toEqual({ name: "dashboard" });
    });
    it("should return the default icon for a regular question", () => {
      expect(getIcon({ model: "card" })).toEqual({ name: "table" });
    });

    describe("enterprise icons", () => {
      it("should return the correct icon for an instance analytics collection", () => {
        expect(
          getIcon({ model: "collection", type: "instance-analytics" }),
        ).toEqual({ name: "audit" });
      });

      it("should return the correct icon for an official collection", () => {
        expect(
          getIcon({ model: "collection", authority_level: "official" }),
        ).toEqual({ name: "badge", color: "saturated-yellow" });
      });

      it("official collection in search", () => {
        const collection = {
          id: 101,
          collection_authority_level: "official",
          model: "collection" as const,
        };
        expect(getIcon(collection).name).toBe("badge");
      });

      it("should return the correct icon for an official model", () => {
        expect(
          getIcon({ model: "dataset", moderated_status: "verified" }),
        ).toEqual({ name: "model_with_badge" });
      });
    });
  });
});
