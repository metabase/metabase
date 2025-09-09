import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import {
  createMockActionDashboardCard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockHeadingDashboardCard,
  createMockTextDashboardCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";

import {
  findDashCardForInlineParameter,
  getDashcardResultsError,
  getVisibleCardIds,
  hasInlineParameters,
  isDashcardLoading,
} from "./dashcard-utils";

describe("Dashcard utils", () => {
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

    const visualizerCardId = 4;
    const visualizerCard = createMockDashboardCard({
      id: visualizerCardId,
      visualization_settings: {
        visualization: {
          display: "table",
          columnValuesMapping: {},
          settings: { "card.hide_empty": true },
        },
      },
    });

    const loadingData = {
      [normalCardId]: {
        100: null,
      },
      [hidingWhenEmptyCardId]: {
        200: null,
      },
      [visualizerCardId]: {
        300: null,
      },
    };

    const loadedEmptyData = {
      [normalCardId]: {
        100: createMockDataset(),
      },
      [hidingWhenEmptyCardId]: {
        200: createMockDataset(),
      },
      [visualizerCardId]: {
        300: createMockDataset(),
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
      [visualizerCardId]: {
        300: createMockDataset({
          data: createMockDatasetData({ rows: [[1]] }),
        }),
      },
    };

    const cards = [
      virtualCard,
      normalCard,
      hidingWhenEmptyCard,
      visualizerCard,
    ];

    it("when loading and no cards previously were visible it should show only virtual and normal cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadingData);
      expect(visibleIds).toStrictEqual(new Set([virtualCardId, normalCardId]));
    });

    it("when loading and cards were visible it should show all of cards", () => {
      const visibleIds = getVisibleCardIds(
        cards,
        loadingData,
        new Set([
          virtualCardId,
          normalCardId,
          hidingWhenEmptyCardId,
          visualizerCardId,
        ]),
      );
      expect(visibleIds).toStrictEqual(
        new Set([
          virtualCardId,
          normalCardId,
          hidingWhenEmptyCardId,
          visualizerCardId,
        ]),
      );
    });

    it("when loaded empty it should show only virtual and normal cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadedEmptyData);
      expect(visibleIds).toStrictEqual(new Set([virtualCardId, normalCardId]));
    });

    it("when loaded with data it should show all of cards", () => {
      const visibleIds = getVisibleCardIds(cards, loadedWithData);
      expect(visibleIds).toStrictEqual(
        new Set([
          virtualCardId,
          normalCardId,
          hidingWhenEmptyCardId,
          visualizerCardId,
        ]),
      );
    });
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
});
