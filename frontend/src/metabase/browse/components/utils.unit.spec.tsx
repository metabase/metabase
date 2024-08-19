import { createMockCollection } from "metabase-types/api/mocks";
import { SortDirection } from "metabase-types/api/sorting";

import { createMockModelResult } from "../test-utils";
import type { ModelResult } from "../types";

import {
  getCollectionPathString,
  sortModels,
  getMaxRecentModelCount,
} from "./utils";

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
    } as const;
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["A", "B", "C"]);
  });

  it("can sort by name in descending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Desc,
    } as const;
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "B", "A"]);
  });

  it("can sort by collection path in ascending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Asc,
    } as const;
    const sorted = sortModels(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["B", "A", "C"]);
  });

  it("can sort by collection path in descending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Desc,
    } as const;
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
      } as const;
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
      } as const;
      const sorted = sortModels(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        modelMap["model named C, with collection path Z"],
        modelMap["model named C, with collection path Y"],
        modelMap["model named A, with collection path X / Y / Z"],
        modelMap["model named Bz, with collection path D / E / F"],
        modelMap["model named B, with collection path D / E / F"],
      ]);
    });

    it("can sort by collection path, ascending, and then does a secondary sort by name - with a localized sort order", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Asc,
      } as const;

      const addUmlauts = (model: ModelResult): ModelResult => ({
        ...model,
        name: model.name.replace(/^B$/g, "Bä"),
        collection: {
          ...model.collection,
          effective_ancestors: model.collection?.effective_ancestors?.map(
            ancestor => ({
              ...ancestor,
              name: ancestor.name.replace("X", "Ä"),
            }),
          ),
        },
      });

      const swedishModelMap = {
        "model named A, with collection path Ä / Y / Z": addUmlauts(
          modelMap["model named A, with collection path X / Y / Z"],
        ),
        "model named Bä, with collection path D / E / F": addUmlauts(
          modelMap["model named B, with collection path D / E / F"],
        ),
        "model named Bz, with collection path D / E / F": addUmlauts(
          modelMap["model named Bz, with collection path D / E / F"],
        ),
        "model named C, with collection path Y": addUmlauts(
          modelMap["model named C, with collection path Y"],
        ),
        "model named C, with collection path Z": addUmlauts(
          modelMap["model named C, with collection path Z"],
        ),
      };

      const swedishResults = Object.values(swedishModelMap);

      // When sorting in Swedish, z comes before ä
      const swedishLocaleCode = "sv";
      const sorted = sortModels(
        swedishResults,
        sortingOptions,
        swedishLocaleCode,
      );
      expect("ä".localeCompare("z", "sv", { sensitivity: "base" })).toEqual(1);
      expect(sorted).toEqual([
        swedishModelMap["model named Bz, with collection path D / E / F"], // Model Bz sorts before Bä
        swedishModelMap["model named Bä, with collection path D / E / F"],
        swedishModelMap["model named C, with collection path Y"],
        swedishModelMap["model named C, with collection path Z"], // Collection Z sorts before Ä
        swedishModelMap["model named A, with collection path Ä / Y / Z"],
      ]);
    });
  });
});

describe("getMaxRecentModelCount", () => {
  it("returns 8 for modelCount greater than 20", () => {
    expect(getMaxRecentModelCount(21)).toBe(8);
    expect(getMaxRecentModelCount(100)).toBe(8);
  });

  it("returns 4 for modelCount greater than 9 and less than or equal to 20", () => {
    expect(getMaxRecentModelCount(10)).toBe(4);
    expect(getMaxRecentModelCount(20)).toBe(4);
  });

  it("returns 0 for modelCount of 9 or less", () => {
    expect(getMaxRecentModelCount(0)).toBe(0);
    expect(getMaxRecentModelCount(5)).toBe(0);
    expect(getMaxRecentModelCount(9)).toBe(0);
  });
});
