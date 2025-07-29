import { createMockDatabase } from "metabase-types/api/mocks";

import { hasDatabaseFeature } from "./database";

describe("hasDatabaseFeature", () => {
  it("returns true when feature is null", () => {
    const database = createMockDatabase({ features: [] });
    expect(hasDatabaseFeature(database, null)).toBe(true);
  });

  it("returns true when feature is undefined", () => {
    const database = createMockDatabase({ features: [] });
    expect(hasDatabaseFeature(database, undefined)).toBe(true);
  });

  it("returns true when database has the specified feature", () => {
    const database = createMockDatabase({ features: ["basic-aggregations"] });
    expect(hasDatabaseFeature(database, "basic-aggregations")).toBe(true);
  });

  it("returns false when database does not have the specified feature", () => {
    const database = createMockDatabase({ features: ["basic-aggregations"] });
    expect(hasDatabaseFeature(database, "advanced-math-expressions")).toBe(
      false,
    );
  });

  describe("join feature", () => {
    it("returns true when database has left-join", () => {
      const database = createMockDatabase({ features: ["left-join"] });
      expect(hasDatabaseFeature(database, "join")).toBe(true);
    });

    it("returns true when database has right-join", () => {
      const database = createMockDatabase({ features: ["right-join"] });
      expect(hasDatabaseFeature(database, "join")).toBe(true);
    });

    it("returns true when database has inner-join", () => {
      const database = createMockDatabase({ features: ["inner-join"] });
      expect(hasDatabaseFeature(database, "join")).toBe(true);
    });

    it("returns true when database has full-join", () => {
      const database = createMockDatabase({ features: ["full-join"] });
      expect(hasDatabaseFeature(database, "join")).toBe(true);
    });

    it("returns false when database has no join features", () => {
      const database = createMockDatabase({ features: ["basic-aggregations"] });
      expect(hasDatabaseFeature(database, "join")).toBe(false);
    });

    it("returns true when database has multiple join features", () => {
      const database = createMockDatabase({
        features: ["left-join", "right-join"],
      });
      expect(hasDatabaseFeature(database, "join")).toBe(true);
    });
  });
});
