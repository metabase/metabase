import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { getParametersMappedToCard } from "./getNewCardUrl";

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
