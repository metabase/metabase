import type { ModelResult } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { SortDirection } from "metabase-types/api/sorting";

import { createMockModelResult } from "../test-utils";

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
  let id = 0;
  const modelMap: Record<string, ModelResult> = {
    "model named A, with collection path X / Y / Z": createMockModelResult({
      id: id++,
      name: "A",
      collection: createMockCollection({
        name: "Z",
        effective_ancestors: [
          createMockCollection({ name: "X" }),
          createMockCollection({ name: "Y" }),
        ],
      }),
    }),
    "model named C, with collection path Y": createMockModelResult({
      id: id++,
      name: "C",
      collection: createMockCollection({ name: "Y" }),
    }),
    "model named B, with collection path D / E / F": createMockModelResult({
      id: id++,
      name: "B",
      collection: createMockCollection({
        name: "F",
        effective_ancestors: [
          createMockCollection({ name: "D" }),
          createMockCollection({ name: "E" }),
        ],
      }),
    }),
  };
  const mockSearchResults = Object.values(modelMap);

  it("can sort by name in ascending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Asc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["A", "B", "C"]);
  });

  it("can sort by name in descending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Desc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "B", "A"]);
  });

  it("can sort by collection path in ascending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Asc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["B", "A", "C"]);
  });

  it("can sort by collection path in descending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Desc,
    };
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "A", "B"]);
  });

  describe("secondary sort", () => {
    modelMap["model named C, with collection path Z"] = createMockModelResult({
      name: "C",
      collection: createMockCollection({ name: "Z" }),
    });
    modelMap["model named Bz, with collection path D / E / F"] =
      createMockModelResult({
        name: "Bz",
        collection: createMockCollection({
          name: "F",
          effective_ancestors: [
            createMockCollection({ name: "D" }),
            createMockCollection({ name: "E" }),
          ],
        }),
      });
    const mockSearchResults = Object.values(modelMap);

    it("can sort by collection path, ascending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Asc,
      };
      const sorted = sortModels(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        modelMap["model named B, with collection path D / E / F"],
        modelMap["model named Bz, with collection path D / E / F"],
        modelMap["model named A, with collection path X / Y / Z"],
        modelMap["model named C, with collection path Y"],
        modelMap["model named C, with collection path Z"],
      ]);
    });

    it("can sort by collection path, descending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Desc,
      };
      const sorted = sortModels(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        modelMap["model named C, with collection path Z"],
        modelMap["model named C, with collection path Y"],
        modelMap["model named A, with collection path X / Y / Z"],
        modelMap["model named Bz, with collection path D / E / F"],
        modelMap["model named B, with collection path D / E / F"],
      ]);
    });
  });
});
