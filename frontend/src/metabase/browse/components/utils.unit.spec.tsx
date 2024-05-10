import { SortDirection } from "metabase/components/ItemsTable/Columns";
import {
  createMockCollection,
  createMockModelResult,
} from "metabase-types/api/mocks";

import { getCollectionPathString, sortModels } from "./utils";

describe("getCollectionPathString", () => {
  it("should return path for collection without ancestors", () => {
    const collection = createMockCollection({
      id: 0,
      name: "Documents",
      effective_ancestors: [],
    });
    const pathString = getCollectionPathString(collection);
    expect(pathString).toBe("Documents");
  });

  it("should return path for collection with multiple ancestors", () => {
    const ancestors = [
      createMockCollection({ name: "Home" }),
      createMockCollection({ name: "User" }),
      createMockCollection({ name: "Files" }),
    ];
    const collection = createMockCollection({
      name: "Documents",
      effective_ancestors: ancestors,
    });
    const pathString = getCollectionPathString(collection);
    expect(pathString).toBe("Home / User / Files / Documents");
  });
});

describe("sortModels", () => {
  const mockSearchResults = [
    createMockModelResult({
      name: "A",
      // This model has collection path X / Y / Z
      collection: createMockCollection({
        name: "Z",
        effective_ancestors: [
          createMockCollection({ name: "X" }),
          createMockCollection({ name: "Y" }),
        ],
      }),
    }),
    createMockModelResult({
      name: "C",
      collection: createMockCollection({ name: "Z" }),
    }),
    createMockModelResult({
      name: "B",
      // This model has collection path D / E / F
      collection: createMockCollection({
        name: "F",
        effective_ancestors: [
          createMockCollection({ name: "D" }),
          createMockCollection({ name: "E" }),
        ],
      }),
    }),
  ];

  it("should sort by name in ascending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Asc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["A", "B", "C"]);
  });

  it("should sort by name in descending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Desc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "B", "A"]);
  });

  it("should sort by collection path in ascending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Asc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["B", "A", "C"]);
  });

  it("should sort by collection path in descending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Desc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "A", "B"]);
  });
});
