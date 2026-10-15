import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import {
  getAccessibleCollection,
  getTreeRowHref,
  getWritableCollection,
} from "./utils";

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

describe("getTreeRowHref", () => {
  it("links dashboards to the main app's dashboard page", () => {
    const href = getTreeRowHref({
      original: {
        id: "dashboard:7",
        name: "Sales",
        icon: "dashboard",
        model: "dashboard",
        data: createMockCollectionItem({ id: 7, model: "dashboard" }),
      },
    });

    expect(href).toBe("/dashboard/7-sales");
  });
});
