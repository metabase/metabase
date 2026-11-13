import type { CardQuestionBuilder } from "metabase/metadata-store";
import { PRODUCT_ANALYTICS_SETTINGS_KEY } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import {
  getNewCardUrl,
  getParametersMappedToCard,
  remapParameterValuesToTemplateTags,
} from "./getNewCardUrl";

describe("getNewCardUrl", () => {
  it("opens a card saved from the event analysis builder in the builder", () => {
    const card = createMockCard({
      id: 7,
      visualization_settings: {
        [PRODUCT_ANALYTICS_SETTINGS_KEY]: {
          version: 1,
          kind: "funnel",
          table_id: 1,
          settings: {},
        },
      },
    });
    const buildQuestion = jest.fn<
      ReturnType<CardQuestionBuilder>,
      Parameters<CardQuestionBuilder>
    >(() => {
      throw new Error("an analysis card should not build a question");
    });

    const url = getNewCardUrl({
      buildQuestion,
      dashboard: createMockDashboard(),
      parameterValues: {},
      nextCard: card,
      previousCard: card,
      dashcard: createMockDashboardCard({ card }),
    });

    expect(url).toBe("/event-analysis/7");
    expect(buildQuestion).not.toHaveBeenCalled();
  });
});

describe("getParametersMappedToDashcard", () => {
  const dashboard = createMockDashboard({
    parameters: [
      createMockParameter({
        id: "foo",
        type: "text",
        target: ["variable", ["template-tag", "abc"]],
      }),
      createMockParameter({
        id: "bar",
        type: "string/=",
        target: ["dimension", ["field", 123, null]],
      }),
      createMockParameter({
        id: "baz",
      }),
    ],
  });

  const card1 = createMockCard({ id: 5 });
  const card2 = createMockCard({ id: 6 });

  const dashcard = createMockDashboardCard({
    parameter_mappings: [
      {
        card_id: card1.id,
        parameter_id: "foo",
        target: ["variable", ["template-tag", "abc"]],
      },
      {
        card_id: card2.id,
        parameter_id: "foo",
        target: ["dimension", ["field", 123, null]],
      },
      {
        card_id: card2.id,
        parameter_id: "bar",
        target: ["dimension", ["field", 123, null]],
      },
    ],
  });

  const dashcardWithNoMappings = createMockDashboardCard();

  it("should return the subset of the dashboard's parameters for the current dashcard and card", () => {
    expect(getParametersMappedToCard([], dashcard, card1)).toEqual([]);

    expect(
      getParametersMappedToCard(
        dashboard.parameters,
        dashcardWithNoMappings,
        card1,
      ),
    ).toEqual([]);

    expect(
      getParametersMappedToCard(dashboard.parameters, dashcard, card1),
    ).toMatchObject([
      {
        id: "foo",
        type: "text",
        target: ["variable", ["template-tag", "abc"]],
      },
    ]);

    expect(
      getParametersMappedToCard(dashboard.parameters, dashcard, card2),
    ).toMatchObject([
      {
        id: "foo",
        type: "text",
        target: ["dimension", ["field", 123, null]],
      },
      {
        id: "bar",
        type: "string/=",
        target: ["dimension", ["field", 123, null]],
      },
    ]);
  });
});

describe("remapParameterValuesToTemplateTags", () => {
  it("should convert a dashboard parameterValues map into a map of template tag values", () => {
    const parameterValues = {
      "dashboard-parameter-1": "aaa",
      "dashboard-parameter-2": "bbb",
      "dashboard-parameter-3": null,
      "dashboard-parameter-4": "ddd",
    };

    // Unjustified type cast. FIXME
    const dashboardParameters = [
      {
        id: "dashboard-parameter-1",
        target: ["variable", ["template-tag", "template-tag-1"]],
      },
      {
        id: "dashboard-parameter-2",
        target: ["dimension", ["template-tag", "template-tag-2"]],
      },
      {
        id: "dashboard-parameter-3",
        target: ["dimension", ["template-tag", "template-tag-3"]],
      },
      {
        id: "dashboard-parameter-4",
        target: ["dimension", ["field", 1, null]],
      },
      {
        id: "dashboard-parameter-5",
      },
    ] as any;

    // Unjustified type cast. FIXME
    const templateTags = [
      { name: "template-tag-1" },
      { name: "template-tag-2" },
      { name: "template-tag-3" },
    ] as any;

    expect(
      remapParameterValuesToTemplateTags(
        templateTags,
        dashboardParameters,
        parameterValues,
      ),
    ).toEqual({
      "template-tag-1": "aaa",
      "template-tag-2": "bbb",
      "template-tag-3": null,
    });
  });
});
