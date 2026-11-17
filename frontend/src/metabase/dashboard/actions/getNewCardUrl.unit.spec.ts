import { createMockMetadata } from "__support__/metadata";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import type { CardQuestionBuilder } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getNewCardUrl,
  getParametersMappedToCard,
  remapParameterValuesToTemplateTags,
} from "./getNewCardUrl";

describe("getNewCardUrl", () => {
  it("should keep the card name when dashboard parameters are applied (metabase#42165)", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const buildQuestion: CardQuestionBuilder = (card, parameterValues) =>
      new Question(card, metadata, parameterValues);
    const card = createMockCard({
      id: 9,
      name: "fooBarQuestion",
      display: "bar",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(Lib.metadataProvider(SAMPLE_DB_ID, metadata), {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });
    const parameter = createMockParameter({
      id: "date",
      slug: "date",
      type: "date/all-options",
    });
    const dashcard = createMockDashboardCard({
      card_id: card.id,
      card,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameter.id,
          target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
        },
      ],
    });

    const url = getNewCardUrl({
      buildQuestion,
      dashboard: createMockDashboard({
        dashcards: [dashcard],
        parameters: [parameter],
      }),
      parameterValues: { [parameter.id]: "2027-01" },
      nextCard: card,
      previousCard: card,
      dashcard,
    });

    const { pathname, hash } = new URL(url ?? "", "http://localhost");
    expect(pathname).toBe("/question");
    const nextCard = deserializeCardFromUrl(hash);
    expect(nextCard.name).toBe("fooBarQuestion");
    expect(nextCard.original_card_id).toBe(card.id);
    expect(Lib.filters(buildQuestion(nextCard).query(), -1)).toHaveLength(1);
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
