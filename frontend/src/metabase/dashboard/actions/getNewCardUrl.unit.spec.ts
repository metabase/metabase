import {
  createMockDashboard,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { getParametersMappedToDashcard } from "./getNewCardUrl";

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

  const dashcard = createMockDashboardCard({
    parameter_mappings: [
      {
        card_id: 5,
        parameter_id: "foo",
        target: ["variable", ["template-tag", "abc"]],
      },
      {
        card_id: 6,
        parameter_id: "bar",
        target: ["dimension", ["field", 123, null]],
      },
    ],
  });

  const dashcardWithNoMappings = createMockDashboardCard();

  it("should return the subset of the dashboard's parameters that are found in a given dashcard's parameter_mappings", () => {
    expect(getParametersMappedToDashcard([], dashcard)).toEqual([]);
    expect(
      getParametersMappedToDashcard(
        dashboard.parameters,
        dashcardWithNoMappings,
      ),
    ).toEqual([]);

    expect(
      getParametersMappedToDashcard(dashboard.parameters, dashcard),
    ).toMatchObject([
      {
        id: "foo",
        type: "text",
        target: ["variable", ["template-tag", "abc"]],
      },
      {
        id: "bar",
        type: "string/=",
        target: ["dimension", ["field", 123, null]],
      },
    ]);
  });
});
