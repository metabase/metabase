import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import {
  getParametersMappedToCard,
  remapParameterValuesToTemplateTags,
} from "./getNewCardUrl";

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
