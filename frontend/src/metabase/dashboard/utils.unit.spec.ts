import type { Location } from "history";

import {
  canResetFilter,
  createTabSlug,
  fetchDataOrError,
  findDashCardForInlineParameter,
  getCurrentTabDashboardCards,
  getDashcardResultsError,
  getVisibleCardIds,
  hasDatabaseActionsEnabled,
  hasInlineParameters,
  isDashcardLoading,
  parseTabSlug,
  setDashboardHeaderParameterIndex,
  syncParametersAndEmbeddingParams,
} from "metabase/dashboard/utils";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import { checkNotNull } from "metabase/lib/types";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import {
  createMockActionDashboardCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockTextDashboardCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import { createMockLocation } from "metabase-types/store/mocks";

const ENABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 1,
  settings: { "database-enable-actions": true },
});
const DISABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 2,
  settings: { "database-enable-actions": false },
});
const NO_ACTIONS_DATABASE = createMockDatabase({ id: 3 });

function getMockLocationWithTab(slug: Location["query"][string]) {
  return createMockLocation({ query: { tab: slug } });
}

describe("Dashboard utils", () => {
  describe("fetchDataOrError()", () => {
    it("should return data on successful fetch", async () => {
      const data = {
        series: [1, 2, 3],
      };

      const successfulFetch = Promise.resolve(data);

      const result = (await fetchDataOrError(successfulFetch)) as any;

      expect(result.error).toBeUndefined();
      expect(result).toEqual(data);
    });

    it("should return map with error key on failed fetch", async () => {
      const error = {
        status: 504,
        statusText: "GATEWAY_TIMEOUT",
        data: {
          message:
            "Failed to load resource: the server responded with a status of 504 (GATEWAY_TIMEOUT)",
        },
      };

      const failedFetch = Promise.reject(error);

      const result = await fetchDataOrError(failedFetch);
      expect(result.error).toEqual(error);
    });

    it("should return true if a database has model actions enabled", () => {
      expect(hasDatabaseActionsEnabled(ENABLED_ACTIONS_DATABASE)).toBe(true);
    });

    it("should return false if a database does not have model actions enabled or is undefined", () => {
      expect(hasDatabaseActionsEnabled(DISABLED_ACTIONS_DATABASE)).toBe(false);
      expect(hasDatabaseActionsEnabled(NO_ACTIONS_DATABASE)).toBe(false);
    });

    it("should return true if any database has actions enabled", () => {
      const databases = [
        ENABLED_ACTIONS_DATABASE,
        DISABLED_ACTIONS_DATABASE,
        NO_ACTIONS_DATABASE,
      ];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(true);
    });

    it("should return false if all databases have actions disabled", () => {
      const databases = [DISABLED_ACTIONS_DATABASE, NO_ACTIONS_DATABASE];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(false);
    });
  });

  describe("syncParametersAndEmbeddingParams", () => {
    it("should rename `embedding_parameters` that are renamed in `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [{ slug: "new_id", id: "unique-param-id" }],
      };

      const expectation = { new_id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should remove `embedding_parameters` that are removed from `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [],
      };

      const expectation = {};

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should not change `embedding_parameters` when `parameters` hasn't changed", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };

      const expectation = { id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });
  });

  describe("isDashcardLoading", () => {
    it("should return false for virtual cards", () => {
      expect(isDashcardLoading(createMockVirtualDashCard(), {})).toBe(false);
    });

    it("should return false for cards with loaded data", () => {
      expect(
        isDashcardLoading(createMockDashboardCard({ id: 1 }), {
          2: createMockDataset(),
        }),
      ).toBe(false);
    });

    it("should return true when the dash card data is missing", () => {
      expect(
        isDashcardLoading(createMockDashboardCard({ id: 1 }), {
          2: null,
          3: createMockDataset(),
        }),
      ).toBe(true);
    });
  });

  describe("getDashcardResultsError", () => {
    const expectedPermissionError = {
      icon: "key",
      message: "Sorry, you don't have permission to see this card.",
    };

    const expectedGenericError = {
      icon: "warning",
      message: "There was a problem displaying this chart.",
    };

    it("should return the access restricted error when the error type is missing-required-permissions", () => {
      const error = getDashcardResultsError([
        createMockDataset({
          error_type: SERVER_ERROR_TYPES.missingPermissions,
        }),
      ]);

      expect(error).toStrictEqual(expectedPermissionError);
    });

    it("should return the access restricted error when the status code is 403", () => {
      const error = getDashcardResultsError([
        createMockDataset({
          error: {
            status: 403,
          },
        }),
      ]);

      expect(error).toStrictEqual(expectedPermissionError);
    });

    it("should return a generic error if a dataset has an error", () => {
      const error = getDashcardResultsError([
        createMockDataset({}),
        createMockDataset({
          error: {
            status: 401,
          },
        }),
      ]);

      expect(error).toStrictEqual(expectedGenericError);
    });

    it("should return a curated error in case it is set in the response", () => {
      const error = getDashcardResultsError([
        createMockDataset({}),
        createMockDataset({
          error: "Wrong query",
          error_is_curated: true,
        }),
      ]);

      expect(error).toEqual({
        icon: "warning",
        message: "Wrong query",
      });
    });

    it("should return a generic error in case the error is curated but is not a string", () => {
      const error = getDashcardResultsError([
        createMockDataset({}),
        createMockDataset({
          error: { status: 500 },
          error_is_curated: true,
        }),
      ]);

      expect(error).toEqual(expectedGenericError);
    });

    it("should not return any errors if there are no any errors", () => {
      const error = getDashcardResultsError([createMockDataset({})]);

      expect(error).toBeUndefined();
    });

    it("should not return any errors if the error is curated but there is no error message or object set", () => {
      const error = getDashcardResultsError([
        createMockDataset({
          error: undefined,
          error_is_curated: true,
        }),
      ]);

      expect(error).toBeUndefined();
    });
  });

  describe("getVisibleCardIds", () => {
    const virtualCardId = 1;
    const virtualCard = createMockVirtualDashCard({
      id: virtualCardId,
    });

    const normalCardId = 2;
    const normalCard = createMockDashboardCard({ id: normalCardId });

    const hidingWhenEmptyCardId = 3;
    const hidingWhenEmptyCard = createMockDashboardCard({
      id: hidingWhenEmptyCardId,
      visualization_settings: { "card.hide_empty": true },
    });

    const loadingData = {
      [normalCardId]: {
        100: null,
      },
      [hidingWhenEmptyCardId]: {
        200: null,
      },
    };

    const loadedEmptyData = {
      [normalCardId]: {
        100: createMockDataset(),
      },
      [hidingWhenEmptyCardId]: {
        200: createMockDataset(),
      },
    };

    const loadedWithData = {
      [normalCardId]: {
        100: createMockDataset({
          data: createMockDatasetData({ rows: [[1]] }),
        }),
      },
      [hidingWhenEmptyCardId]: {
        200: createMockDataset({
          data: createMockDatasetData({ rows: [[1]] }),
        }),
      },
    };

    const cards = [virtualCard, normalCard, hidingWhenEmptyCard];

    it("when loading and no cards previously were visible it should show only virtual and normal cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadingData);
      expect(visibleIds).toStrictEqual(new Set([virtualCardId, normalCardId]));
    });

    it("when loading and cards were visible it should show all of cards", () => {
      const visibleIds = getVisibleCardIds(
        cards,
        loadingData,
        new Set([virtualCardId, normalCardId, hidingWhenEmptyCardId]),
      );
      expect(visibleIds).toStrictEqual(
        new Set([virtualCardId, normalCardId, hidingWhenEmptyCardId]),
      );
    });

    it("when loaded empty it should show only virtual and normal cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadedEmptyData);
      expect(visibleIds).toStrictEqual(new Set([virtualCardId, normalCardId]));
    });

    it("when loaded with data it should show all of cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadedWithData);
      expect(visibleIds).toStrictEqual(
        new Set([virtualCardId, normalCardId, hidingWhenEmptyCardId]),
      );
    });
  });

  describe("getCurrentTabDashboardCards", () => {
    it("when selectedTabId=null returns cards with dashboard_tab_id=undefined", () => {
      const selectedTabId = null;
      const dashcard = createMockDashboardCard({
        dashboard_tab_id: undefined,
      });
      const dashboard = createMockDashboard({
        dashcards: [dashcard],
      });

      expect(
        getCurrentTabDashboardCards(dashboard, selectedTabId),
      ).toStrictEqual([
        {
          card: dashcard.card,
          dashcard,
        },
      ]);
    });

    it("returns cards from selected tab only", () => {
      const selectedTabId = 1;
      const visibleDashcard = createMockDashboardCard({
        dashboard_tab_id: 1,
      });
      const hiddenDashcard = createMockDashboardCard({
        dashboard_tab_id: 2,
      });

      const dashboard = createMockDashboard({
        dashcards: [visibleDashcard, hiddenDashcard],
      });

      expect(
        getCurrentTabDashboardCards(dashboard, selectedTabId),
      ).toStrictEqual([
        {
          card: visibleDashcard.card,
          dashcard: visibleDashcard,
        },
      ]);
    });
  });

  describe("parseTabSlug", () => {
    it("should return the tab ID from the location object if valid", () => {
      expect(parseTabSlug(getMockLocationWithTab("1-tab-name"))).toBe(1);
    });

    it("should return null if the slug is invalid", () => {
      expect(parseTabSlug(getMockLocationWithTab(null))).toBe(null);
      expect(parseTabSlug(getMockLocationWithTab(undefined))).toBe(null);
      expect(parseTabSlug(getMockLocationWithTab(""))).toBe(null);
      expect(
        parseTabSlug(
          getMockLocationWithTab(["1-tab-name", "2-another-tab-name"]),
        ),
      ).toBe(null);
      expect(parseTabSlug({ ...getMockLocationWithTab(""), query: {} })).toBe(
        null,
      );
    });
  });

  describe("createTabSlug", () => {
    it("should return a lower-cased, hyphenated concatenation of the tabId and name", () => {
      expect(createTabSlug({ id: 1, name: "SoMe-TaB-NaMe" })).toEqual(
        "1-some-tab-name",
      );
    });

    it("should return an empty string when tabId or name is invalid", () => {
      expect(createTabSlug({ id: null, name: "SoMe-TaB-NaMe" })).toEqual("");
      expect(createTabSlug({ id: -1, name: "SoMe-TaB-NaMe" })).toEqual("");

      expect(createTabSlug({ id: 1, name: "" })).toEqual("");
      expect(createTabSlug({ id: 1, name: undefined })).toEqual("");
    });
  });

  describe("canResetFilter", () => {
    function getEmptyDefaultValueCases({
      default: defaultValue,
    }: {
      default: unknown;
    }) {
      return [
        { default: defaultValue, value: null, expected: false },
        { default: defaultValue, value: undefined, expected: false },
        { default: defaultValue, value: "", expected: false },
        { default: defaultValue, value: [], expected: false },
        { default: defaultValue, value: "a", expected: true },
        { default: defaultValue, value: 0, expected: true },
        { default: defaultValue, value: ["a"], expected: true },
        { default: defaultValue, value: [0], expected: true },
      ];
    }

    it.each<{ default: unknown; value: unknown; expected: boolean }>([
      ...getEmptyDefaultValueCases({ default: null }),
      ...getEmptyDefaultValueCases({ default: undefined }),
      ...getEmptyDefaultValueCases({ default: "" }),
      ...getEmptyDefaultValueCases({ default: [] }),

      { default: "a", value: null, expected: true },
      { default: "a", value: undefined, expected: true },
      { default: "a", value: "", expected: true },
      { default: "a", value: [], expected: true },
      { default: "a", value: "a", expected: false },
      { default: "a", value: "b", expected: true },
      { default: "a", value: 0, expected: true },
      { default: "a", value: ["a"], expected: false }, // interesting case
      { default: "a", value: [0], expected: true },

      { default: 0, value: null, expected: true },
      { default: 0, value: undefined, expected: true },
      { default: 0, value: "", expected: true },
      { default: 0, value: [], expected: true },
      { default: 0, value: "a", expected: true },
      { default: 0, value: 0, expected: false },
      { default: 0, value: 1, expected: true },
      { default: 0, value: ["a"], expected: true },
      { default: 0, value: [0], expected: false }, // interesting case

      { default: ["a"], value: null, expected: true },
      { default: ["a"], value: undefined, expected: true },
      { default: ["a"], value: "", expected: true },
      { default: ["a"], value: [], expected: true },
      { default: ["a"], value: "a", expected: false }, // interesting case
      { default: ["a"], value: "b", expected: true },
      { default: ["a"], value: 0, expected: true },
      { default: ["a"], value: ["a"], expected: false },
      { default: ["a"], value: ["b"], expected: true },
      { default: ["a"], value: [0], expected: true },

      { default: [1, 0], value: [0, 1], expected: false }, // order is not important
      { default: [1, 0], value: [0, 1, 2], expected: true },
      { default: [1, 0], value: [0], expected: true },

      { default: ["a", "b"], value: ["b", "a"], expected: false }, // order is not important
      { default: ["a", "b"], value: ["b", "a", "c"], expected: true },
      { default: ["a", "b"], value: ["b"], expected: true },
    ])(
      "default = `$default` | value = `$value` | expected = `$expected`",
      ({ default: defaultValue, value, expected }) => {
        const parameter = createMockUiParameter({
          default: defaultValue,
          value,
        });

        expect(canResetFilter(parameter)).toBe(expected);
      },
    );
  });

  describe("hasInlineParameters", () => {
    it("should return true for dashcards with inline parameters", () => {
      const heading = createMockHeadingDashboardCard({
        inline_parameters: ["1"],
      });
      const dashcard = createMockDashboardCard({
        inline_parameters: ["2"],
      });

      expect(hasInlineParameters(heading)).toBe(true);
      expect(hasInlineParameters(dashcard)).toBe(true);
    });

    it("should return false for dashcards with empty inline parameters list", () => {
      const heading = createMockHeadingDashboardCard({
        inline_parameters: [],
      });
      const dashcard = createMockDashboardCard({
        inline_parameters: [],
      });

      expect(hasInlineParameters(heading)).toBe(false);
      expect(hasInlineParameters(dashcard)).toBe(false);
    });

    it("should return false for dashcards with null-ish inline parameters", () => {
      const heading = createMockHeadingDashboardCard({
        inline_parameters: null,
      });
      const dashcard = createMockDashboardCard({
        inline_parameters: null,
      });

      expect(hasInlineParameters(heading)).toBe(false);
      expect(hasInlineParameters(dashcard)).toBe(false);
    });

    it("should return false for dashcards that don't support inline parameters", () => {
      expect(hasInlineParameters(createMockActionDashboardCard())).toBe(false);
      expect(hasInlineParameters(createMockTextDashboardCard())).toBe(false);

      // Only heading cards support inline parameters
      expect(
        hasInlineParameters(
          createMockTextDashboardCard({ inline_parameters: ["1"] }),
        ),
      ).toBe(false);

      expect(
        hasInlineParameters(
          // @ts-expect-error — testing a normally impossible case (actions dashcards don't have inline parameters)
          createMockActionDashboardCard({ inline_parameters: ["1"] }),
        ),
      ).toBe(false);
    });
  });

  describe("findDashCardForInlineParameter", () => {
    const dashcards = [
      createMockActionDashboardCard({ id: 1 }),
      createMockDashboardCard({ id: 2 }),
      createMockHeadingDashboardCard({ id: 3, inline_parameters: null }),
      createMockHeadingDashboardCard({ id: 4, inline_parameters: [] }),
      createMockHeadingDashboardCard({ id: 5, inline_parameters: ["param-1"] }),
      createMockDashboardCard({
        id: 6,
        inline_parameters: ["param-2", "param-3"],
      }),
    ];

    it("should return the dashcard containing the given parameter ID", () => {
      const dashcard1 = findDashCardForInlineParameter("param-1", dashcards);
      expect(dashcard1?.id).toBe(5);

      const dashcard2 = findDashCardForInlineParameter("param-3", dashcards);
      expect(dashcard2?.id).toBe(6);
    });

    it("should return undefined when no dashcard contains the given parameter ID", () => {
      const dashcard = findDashCardForInlineParameter(
        "non-existing-param",
        dashcards,
      );
      expect(dashcard).toBeUndefined();
    });

    it("should ignore dashcards that don't support inline parameters", () => {
      const dashcard1 = findDashCardForInlineParameter("param-1", [
        createMockTextDashboardCard({ id: -1, inline_parameters: ["param-1"] }),
        ...dashcards,
        createMockTextDashboardCard({ id: -2, inline_parameters: ["param-1"] }),
      ]);
      expect(dashcard1?.id).toBe(5);
    });
  });

  describe("setDashboardHeaderParameterIndex", () => {
    describe("with header parameters only", () => {
      const parameters = [
        createMockParameter({ id: "1" }),
        createMockParameter({ id: "2" }),
        createMockParameter({ id: "3" }),
      ];
      const headerParameterIds = parameters.map((p) => p.id);

      it("should do nothing if the index is the same", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "2", "3"]);
      });

      it("should move the first parameter to the end of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "3", "1"]);
      });

      it("should move the first parameter to the middle of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "1", "3"]);
      });

      it("should move the last parameter to the beginning of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "3",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["3", "1", "2"]);
      });

      it("should move the last parameter to the middle of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "3",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "3", "2"]);
      });

      it("should move the middle parameter to the beginning of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "2",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["2", "1", "3"]);
      });

      it("should move the middle parameter to the end of the list", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "2",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual(["1", "3", "2"]);
      });
    });

    describe("with inline parameters", () => {
      const parameters = [
        createMockParameter({ id: "1" }),
        createMockParameter({ id: "2" }),
        createMockParameter({ id: "3" }),
        createMockParameter({ id: "4" }),
        createMockParameter({ id: "5" }),
      ];
      const headerParameterIds = ["1", "3", "4"];

      it("should move a header parameter to the end", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "1",
            2,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "2",
          "3",
          "4",
          "1",
          "5",
        ]);
      });

      it("should move a header parameter to the beginning", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "4",
            0,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "4",
          "1",
          "2",
          "3",
          "5",
        ]);
      });

      it("should move a header parameter to the middle", () => {
        const newParameters = checkNotNull(
          setDashboardHeaderParameterIndex(
            parameters,
            headerParameterIds,
            "4",
            1,
          ),
        );
        expect(newParameters.map((p) => p.id)).toEqual([
          "1",
          "4",
          "2",
          "3",
          "5",
        ]);
      });
    });
  });
});
