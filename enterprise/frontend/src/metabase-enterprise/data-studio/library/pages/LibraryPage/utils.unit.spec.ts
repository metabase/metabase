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
  it("returns collection when it exists with can_write true", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: true,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toEqual(childCollection);
  });

  it("returns collection when it exists with can_write false", () => {
    const childCollection = createMockCollection({
      id: 2,
      type: "library-data",
      can_write: false,
    });
    const rootCollection = createMockCollection({
      id: 1,
      children: [childCollection],
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toEqual(childCollection);
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

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });

  it("returns undefined when root collection has no children", () => {
    const rootCollection = createMockCollection({
      id: 1,
      children: undefined,
    });

    const result = getAccessibleCollection(rootCollection, "library-data");

    expect(result).toBeUndefined();
  });
});
