import { defaultRootCollection } from "metabase/admin/permissions/pages/CollectionPermissionsPage/tests/setup";
import type { SearchResult } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { SortDirection } from "metabase-types/api/sorting";

import { createMockModelResult } from "../test-utils";

import type { ModelResult } from "./types";
import type { ActualModelFilters, AvailableModelFilters } from "./utils";
import { filterModels, getMaxRecentModelCount, sortModels } from "./utils";

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

const collectionAlpha = createMockCollection({ id: 0, name: "Alpha" });
const collectionBeta = createMockCollection({ id: 1, name: "Beta" });
const collectionCharlie = createMockCollection({ id: 2, name: "Charlie" });
const collectionDelta = createMockCollection({ id: 3, name: "Delta" });
const collectionZulu = createMockCollection({ id: 4, name: "Zulu" });
const collectionAngstrom = createMockCollection({ id: 5, name: "Ångström" });
const collectionOzgur = createMockCollection({ id: 6, name: "Özgür" });

const mockModels: ModelResult[] = [
  {
    id: 0,
    name: "Model 0",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:59.000Z",
  },
  {
    id: 1,
    name: "Model 1",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:30.000Z",
  },
  {
    id: 2,
    name: "Model 2",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:00.000Z",
  },
  {
    id: 3,
    name: "Model 3",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:50:00.000Z",
  },
  {
    id: 4,
    name: "Model 4",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:00:00.000Z",
  },
  {
    id: 5,
    name: "Model 5",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T22:00:00.000Z",
  },
  {
    id: 6,
    name: "Model 6",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T12:00:00.000Z",
  },
  {
    id: 7,
    name: "Model 7",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-10T12:00:00.000Z",
  },
  {
    id: 8,
    name: "Model 8",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-11-15T12:00:00.000Z",
  },
  {
    id: 9,
    name: "Model 9",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-02-15T12:00:00.000Z",
  },
  {
    id: 10,
    name: "Model 10",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2023-12-15T12:00:00.000Z",
  },
  {
    id: 11,
    name: "Model 11",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2020-01-01T00:00:00.000Z",
  },
  {
    id: 12,
    name: "Model 12",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 13,
    name: "Model 13",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 14,
    name: "Model 14",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 15,
    name: "Model 15",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 16,
    name: "Model 16",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 17,
    name: "Model 17",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 18,
    name: "Model 18",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 19,
    name: "Model 19",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 20,
    name: "Model 20",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 21,
    name: "Model 20",
    collection: defaultRootCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 22,
    name: "Model 21",
    collection: defaultRootCollection,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
].map(model => createMockModelResult(model));

describe("Browse utils", () => {
  const diverseModels = mockModels.map((model, index) => ({
    ...model,
    name: index % 2 === 0 ? `red ${index}` : `blue ${index}`,
    moderated_status: index % 3 === 0 ? `good ${index}` : `bad ${index}`,
  }));
  const availableModelFilters: AvailableModelFilters = {
    onlyRed: {
      predicate: model => model.name.startsWith("red"),
      activeByDefault: false,
    },
    onlyGood: {
      predicate: model => Boolean(model.moderated_status?.startsWith("good")),
      activeByDefault: false,
    },
    onlyBig: {
      predicate: model => Boolean(model.description?.startsWith("big")),
      activeByDefault: true,
    },
  };

  it("include a function that filters models, based on the object provided", () => {
    const onlyRedAndGood: ActualModelFilters = {
      onlyRed: true,
      onlyGood: true,
      onlyBig: false,
    };
    const onlyRedAndGoodModels = filterModels(
      diverseModels,
      onlyRedAndGood,
      availableModelFilters,
    );
    const everySixthModel = diverseModels.reduce<SearchResult[]>(
      (acc, model, index) => {
        return index % 6 === 0 ? [...acc, model] : acc;
      },
      [],
    );
    // Since every other model is red and every third model is good,
    // we expect every sixth model to be both red and good
    expect(onlyRedAndGoodModels).toEqual(everySixthModel);
  });

  it("filterModels does not filter out models if no filters are active", () => {
    const noActiveFilters: ActualModelFilters = {
      onlyRed: false,
      onlyGood: false,
      onlyBig: false,
    };
    const filteredModels = filterModels(
      diverseModels,
      noActiveFilters,
      availableModelFilters,
    );
    expect(filteredModels).toEqual(diverseModels);
  });
});
