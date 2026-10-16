import { createMockEventDefinition } from "../events/mocks";

import { getInsightPathsSettings } from "./paths-settings";

const STEPS = ["Viewed pricing", "Started trial", "Purchased"].map((name) =>
  createMockEventDefinition({ name }),
);

describe("getInsightPathsSettings", () => {
  it("shows the paths between the two steps of the insight's transition", () => {
    expect(getInsightPathsSettings({ transition: 2 }, STEPS)).toEqual({
      "funnel.steps": [STEPS[1], STEPS[2]],
      "funnel.view": "paths",
      "funnel.breakdown": [],
    });
  });
});
