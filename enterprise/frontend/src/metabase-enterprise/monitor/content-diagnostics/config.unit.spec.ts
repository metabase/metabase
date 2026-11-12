import {
  type DuplicatedContentParams,
  duplicatedContentConfig,
  getImbalancedContentConfig,
  slowContentConfig,
  staleContentConfig,
} from "./config";

const configs = [
  [
    "stale",
    staleContentConfig,
    "threshold-days",
    "thresholdDays",
    "last-active-at",
  ],
  [
    "slow",
    slowContentConfig,
    "min-duration-ms",
    "minDurationMs",
    "duration-ms",
  ],
  [
    "duplicated",
    duplicatedContentConfig,
    "min-duplicate-count",
    "minDuplicateCount",
    "duplicate-count",
  ],
] as const;

describe.each(configs)(
  "%s content config",
  (_name, config, urlKey, paramKey, sortColumn) => {
    it("parses valid filters, sorting, and threshold", () => {
      const params = config.urlState.parse({
        page: "2",
        query: "sales",
        "entity-types": ["model", "invalid"],
        "include-personal-collections": "false",
        [urlKey]: "90",
        "sort-column": sortColumn,
        "sort-direction": "desc",
      });

      expect(params).toMatchObject({
        page: 2,
        query: "sales",
        entityTypes: ["model"],
        includePersonalCollections: false,
        [paramKey]: 90,
        sortColumn,
        sortDirection: "desc",
      });
    });

    it("rejects invalid page, threshold, sorting, and entity types", () => {
      const params = config.urlState.parse({
        page: "-2",
        "entity-types": ["collection", "bogus"],
        [urlKey]: "invalid",
        "sort-column": "unsupported",
        "sort-direction": "up",
      });

      expect(params.page).toBe(0);
      expect(
        Object.entries(params).find(([key]) => key === paramKey)?.[1],
      ).toBeUndefined();
      expect(params.sortColumn).toBeUndefined();
      expect(params.sortDirection).toBeUndefined();
      expect(params.entityTypes).toEqual(
        config === duplicatedContentConfig ? ["collection"] : [],
      );
    });

    it("recognizes only its own URL keys for last-used restoration", () => {
      expect(config.hasUrlParams({ unrelated: "1" })).toBe(false);
      expect(config.hasUrlParams({ page: "0" })).toBe(true);
      expect(config.hasUrlParams({ [urlKey]: "90" })).toBe(true);
    });
  },
);

describe("content diagnostics config", () => {
  it("omits default filters, page and absent sort from serialization", () => {
    expect(
      slowContentConfig.urlState.serialize({
        page: 0,
        entityTypes: [...slowContentConfig.entityTypes],
        includePersonalCollections: true,
      }),
    ).toMatchObject({
      page: undefined,
      "entity-types": undefined,
      "include-personal-collections": undefined,
      "sort-column": undefined,
      "sort-direction": undefined,
    });
  });

  it("does not erase a repeated single-type filter as if it selected all types", () => {
    const modelOnly = Array(staleContentConfig.entityTypes.length).fill(
      "model",
    );
    const params = staleContentConfig.urlState.parse({
      "entity-types": modelOnly,
    });

    expect(
      staleContentConfig.urlState.serialize(params)["entity-types"],
    ).toEqual(modelOnly);
  });

  it("uses the existing API sort default when the URL has no sort", () => {
    // The API defaults to detected-at ascending, which is not a visible column.
    expect(staleContentConfig.urlState.parse({}).sortColumn).toBeUndefined();
    expect(staleContentConfig.urlState.parse({}).sortDirection).toBeUndefined();
  });

  it("maps persisted user params without page or search query", () => {
    const params: DuplicatedContentParams = {
      page: 3,
      query: "ignored",
      entityTypes: ["dashboard"],
      includePersonalCollections: false,
      minDuplicateCount: 5,
      sortColumn: "duplicate-count" as const,
      sortDirection: "asc" as const,
    };

    const userParams = duplicatedContentConfig.getUserParams(params);
    expect(userParams).toEqual({
      entity_types: ["dashboard"],
      include_personal_collections: false,
      min_duplicate_count: 5,
      sort_column: "duplicate-count",
      sort_direction: "asc",
    });
    expect(duplicatedContentConfig.parseUserParams(userParams)).toEqual({
      entityTypes: ["dashboard"],
      includePersonalCollections: false,
      minDuplicateCount: 5,
      sortColumn: "duplicate-count",
      sortDirection: "asc",
    });
  });

  it.each([
    [
      "empty",
      ["question", "model", "metric", "dashboard", "document", "collection"],
    ],
    ["sparse", ["dashboard", "collection"]],
    ["crowded", ["dashboard", "document", "collection"]],
  ] as const)(
    "limits %s filters to entity types the endpoint can return",
    (mode, expected) => {
      const config = getImbalancedContentConfig(mode);

      expect(config.entityTypes).toEqual(expected);
      expect(
        config.urlState.parse({
          "entity-types": ["question", "dashboard", "document", "collection"],
        }).entityTypes,
      ).toEqual(
        expected.filter((type) =>
          ["question", "dashboard", "document", "collection"].includes(type),
        ),
      );
      expect(config.getFilterOptions({}).entityTypes).toEqual(expected);
    },
  );
});
