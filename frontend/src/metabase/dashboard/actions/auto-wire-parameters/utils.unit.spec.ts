import { createMockStoreDashboard } from "metabase/redux/store/mocks";
import type { QuestionDashboardCard } from "metabase-types/api";
import { createMockParameterMapping } from "metabase-types/api/mocks";

import {
  MATCHING_TARGET,
  PARAMETER,
  PARAMETER_ID,
  createOrdersDashcard,
  getOrdersQuestions,
} from "./tests/setup";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
} from "./utils";

function createDashcard({
  parameterMappings = [],
}: {
  parameterMappings?: QuestionDashboardCard["parameter_mappings"];
} = {}) {
  return createOrdersDashcard({
    seriesCardIds: [2, 3],
    parameterMappings,
  });
}

const questions = getOrdersQuestions([1, 2, 3]);

describe("getAllDashboardCardsWithUnmappedParameters", () => {
  function getUnmappedDashcards(dashcard: QuestionDashboardCard) {
    return getAllDashboardCardsWithUnmappedParameters({
      dashboards: {
        1: createMockStoreDashboard({ id: 1, dashcards: [dashcard.id] }),
      },
      dashcards: { [dashcard.id]: dashcard },
      dashboardId: 1,
      parameterId: PARAMETER_ID,
      selectedTabId: 1,
    });
  }

  it("includes a dashcard when one of its cards is unmapped", () => {
    const dashcard = createDashcard({
      parameterMappings: [
        createMockParameterMapping({
          parameter_id: PARAMETER_ID,
          card_id: 1,
        }),
      ],
    });

    expect(getUnmappedDashcards(dashcard)).toEqual([dashcard]);
  });

  it("excludes a dashcard when all of its cards are mapped", () => {
    const dashcard = createDashcard({
      parameterMappings: [1, 2, 3].map((cardId) =>
        createMockParameterMapping({
          parameter_id: PARAMETER_ID,
          card_id: cardId,
        }),
      ),
    });

    expect(getUnmappedDashcards(dashcard)).toEqual([]);
  });
});

describe("getAutoWiredMappingsForDashcards", () => {
  it("creates a mapping for every card in a dashcard", () => {
    const dashcard = createDashcard();

    expect(
      getAutoWiredMappingsForDashcards(
        PARAMETER,
        [dashcard],
        MATCHING_TARGET,
        questions,
        [dashcard],
      ),
    ).toEqual([
      {
        id: dashcard.id,
        attributes: {
          parameter_mappings: [1, 2, 3].map((cardId) => ({
            parameter_id: PARAMETER_ID,
            card_id: cardId,
            target: MATCHING_TARGET,
          })),
        },
      },
    ]);
  });

  it("preserves existing mappings and only maps unmapped cards", () => {
    const existingMapping = createMockParameterMapping({
      parameter_id: PARAMETER_ID,
      card_id: 1,
      target: ["dimension", ["field", 999, null]],
    });
    const dashcard = createDashcard({
      parameterMappings: [existingMapping],
    });

    expect(
      getAutoWiredMappingsForDashcards(
        PARAMETER,
        [dashcard],
        MATCHING_TARGET,
        questions,
        [dashcard],
      ),
    ).toEqual([
      {
        id: dashcard.id,
        attributes: {
          parameter_mappings: [
            existingMapping,
            {
              parameter_id: PARAMETER_ID,
              card_id: 2,
              target: MATCHING_TARGET,
            },
            {
              parameter_id: PARAMETER_ID,
              card_id: 3,
              target: MATCHING_TARGET,
            },
          ],
        },
      },
    ]);
  });
});
