import { createMockCollection } from "metabase-types/api/mocks";

import { getCollectionType, isRegularCollection } from "./utils";

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
});
