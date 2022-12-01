import { createMockCollection } from "metabase-types/api/mocks";
import { isRegularCollection } from "./utils";

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
});
