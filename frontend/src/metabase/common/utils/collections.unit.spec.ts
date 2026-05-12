import type { Crumb } from "metabase/common/components/Breadcrumbs";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { findCollectionById, getCollectionBreadCrumbs } from "./collections";

describe("findCollectionById", () => {
  it("should return null when collections array is empty or undefined", () => {
    expect(findCollectionById([], 1)).toBeNull();
    expect(findCollectionById(undefined, 1)).toBeNull();
  });

  it("should return null when collectionId is undefined", () => {
    const collections = [createMockCollection({ id: 1 })];
    expect(findCollectionById(collections, undefined)).toBeNull();
  });

  it("should find collection at top level", () => {
    const targetCollection = createMockCollection({ id: 2, name: "Target" });
    const collections = [
      createMockCollection({ id: 1, name: "First" }),
      targetCollection,
      createMockCollection({ id: 3, name: "Third" }),
    ];

    const result = findCollectionById(collections, 2);
    expect(result).toEqual(targetCollection);
  });

  it("should recursively search nested children collections", () => {
    const deeplyNestedCollection = createMockCollection({
      id: 5,
      name: "Deeply Nested",
    });

    const collections: Collection[] = [
      createMockCollection({
        id: 1,
        name: "Parent 1",
        children: [
          createMockCollection({
            id: 2,
            name: "Child 1-1",
            children: [deeplyNestedCollection],
          }),
          createMockCollection({ id: 3, name: "Child 1-2" }),
        ],
      }),
      createMockCollection({
        id: 4,
        name: "Parent 2",
      }),
    ];

    const result = findCollectionById(collections, 5);
    expect(result).toEqual(deeplyNestedCollection);
  });
});

const getCrumbAction = (crumb: Crumb) => {
  if (
    !Array.isArray(crumb) ||
    crumb.length < 2 ||
    typeof crumb[1] !== "function"
  ) {
    throw new Error("Expected crumb callback action");
  }

  return crumb[1];
};

const collectionsById = {
  root: createMockCollection({ id: "root", name: "Our analytics", path: [] }),
  1: createMockCollection({ id: 1, name: "parent", path: ["root"] }),
  2: createMockCollection({ id: 2, name: "child", path: ["root", 1] }),
};

describe("getCollectionBreadCrumbs", () => {
  it("returns path starting from root", () => {
    const crumbs = getCollectionBreadCrumbs(
      collectionsById[2],
      collectionsById,
      jest.fn(),
    );

    expect(crumbs).toMatchObject([
      ["Our analytics", expect.any(Function)],
      ["parent", expect.any(Function)],
      ["child"],
    ]);
  });

  it("makes collection step functions calling the callback with the collection id", () => {
    const callbackMock = jest.fn();
    const crumbs = getCollectionBreadCrumbs(
      collectionsById[2],
      collectionsById,
      callbackMock,
    );

    const rootCallback = getCrumbAction(crumbs[0]);
    // Workaround to simulate actual event object passed by React, impossible to construct.
    rootCallback(undefined as never);
    expect(callbackMock).toHaveBeenCalledWith("root");

    const parentCallback = getCrumbAction(crumbs[1]);
    // Workaround to simulate actual event object passed by React, impossible to construct.
    parentCallback(undefined as never);
    expect(callbackMock).toHaveBeenCalledWith(1);
  });
});
