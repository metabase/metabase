import { isItemInCollectionOrItsDescendants } from "./utils";

describe("isItemInCollectionOrItsDescendants", () => {
  it("returns false when collectionId is undefined", () => {
    const item = {
      id: 1,
      effective_location: "/2/3",
      location: "/2/3",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, undefined)).toBe(false);
  });

  it("returns true when item.id matches collectionId", () => {
    const item = {
      id: 5,
      effective_location: "/2/3",
      location: "/2/3",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 5)).toBe(true);
  });

  it("returns false when item.id does not match and is not a descendant", () => {
    const item = {
      id: 10,
      effective_location: "/2/3",
      location: "/2/3",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 5)).toBe(false);
  });

  it("returns true when item is a descendant (collectionId in effective_location)", () => {
    const item = {
      id: 10,
      effective_location: "/2/5/8",
      location: "/2/5/8",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 5)).toBe(true);
  });

  it("returns true when item is a nested descendant", () => {
    const item = {
      id: 20,
      effective_location: "/1/2/3/4/5",
      location: "/1/2/3/4/5",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 3)).toBe(true);
  });

  it("uses location as fallback when effective_location is undefined", () => {
    const item = {
      id: 10,
      effective_location: undefined,
      location: "/2/5/8",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 5)).toBe(true);
  });

  it("does not match partial IDs in location path", () => {
    const item = {
      id: 100,
      effective_location: "/12/123/1234",
      model: "collection" as const,
      name: "Test",
    };
    expect(isItemInCollectionOrItsDescendants(item, 1)).toBe(false);
    expect(isItemInCollectionOrItsDescendants(item, 12)).toBe(true);
    expect(isItemInCollectionOrItsDescendants(item, 123)).toBe(true);
  });
});
