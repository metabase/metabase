import { canPlaceEntityInCollection } from "./utils";

describe("canPlaceEntityInCollection", () => {
  it("should reject every entity type for the root Library collection", () => {
    expect(canPlaceEntityInCollection("table", "library")).toBe(false);
    expect(canPlaceEntityInCollection("metric", "library")).toBe(false);
    expect(canPlaceEntityInCollection("collection", "library")).toBe(false);
  });

  it("should only allow tables and collections in Library Data collections", () => {
    expect(canPlaceEntityInCollection("table", "library-data")).toBe(true);
    expect(canPlaceEntityInCollection("collection", "library-data")).toBe(true);
    expect(canPlaceEntityInCollection("metric", "library-data")).toBe(false);
  });

  it("should only allow metrics and collections in Library Metrics collections", () => {
    expect(canPlaceEntityInCollection("metric", "library-metrics")).toBe(true);
    expect(canPlaceEntityInCollection("collection", "library-metrics")).toBe(
      true,
    );
    expect(canPlaceEntityInCollection("table", "library-metrics")).toBe(false);
  });

  it("should allow entities in non-Library collections", () => {
    expect(canPlaceEntityInCollection("table", null)).toBe(true);
    expect(canPlaceEntityInCollection("metric", undefined)).toBe(true);
    expect(canPlaceEntityInCollection("collection", null)).toBe(true);
  });
});
