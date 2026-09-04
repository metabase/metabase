import {
  type ParameterMappingOption,
  getParameterMappingOptions,
} from "metabase/parameters/utils/mapping-options";
import { createMockStoreDashboard } from "metabase/redux/store/mocks";
import type {
  CardId,
  QuestionDashboardCard,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockParameter,
  createMockParameterMapping,
} from "metabase-types/api/mocks";

import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
} from "./utils";

jest.mock("metabase/parameters/utils/mapping-options", () => ({
  ...jest.requireActual("metabase/parameters/utils/mapping-options"),
  getParameterMappingOptions: jest.fn(),
}));

const PARAMETER_ID = "parameter";
const MATCHING_TARGET: StructuredParameterDimensionTarget = [
  "dimension",
  ["field", 100, null],
];

function getMappingOption(cardId: CardId): ParameterMappingOption {
  return {
    sectionName: "Table",
    name: `Column ${cardId}`,
    icon: "int",
    target: MATCHING_TARGET,
  };
}

function createDashcard({
  parameterMappings = [],
}: {
  parameterMappings?: QuestionDashboardCard["parameter_mappings"];
} = {}) {
  return createMockDashboardCard({
    id: 1,
    dashboard_tab_id: 1,
    card_id: 1,
    card: createMockCard({ id: 1 }),
    series: [createMockCard({ id: 2 }), createMockCard({ id: 3 })],
    parameter_mappings: parameterMappings,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getParameterMappingOptions)
    .mockImplementation((_question, _parameter, card) => {
      if (card.id == null) {
        return [];
      }
      return [getMappingOption(card.id)];
    });
});

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
  const parameter = createMockParameter({ id: PARAMETER_ID });

  it("creates a mapping for every card in a dashcard", () => {
    const dashcard = createDashcard();

    expect(
      getAutoWiredMappingsForDashcards(
        parameter,
        [dashcard],
        MATCHING_TARGET,
        {},
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
        parameter,
        [dashcard],
        MATCHING_TARGET,
        {},
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
    expect(getParameterMappingOptions).toHaveBeenCalledTimes(2);
  });
});
